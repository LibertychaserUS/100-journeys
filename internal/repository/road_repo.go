package repository

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/road/light"
)

// The Ticket Road's store. Every write is one short transaction on the single connection; reads
// are single indexed queries. Rows are always read to the end before the next statement, because
// with one connection an open cursor would block it.

var (
	ErrDailyCap    = errors.New("daily limit reached")
	ErrPostRemoved = errors.New("ticket was taken down by the station")
	ErrLampLocked  = errors.New("lamp is settled")
)

// sqlTime is the canonical SQLite datetime, so julianday() and string order both work.
func sqlTime(t time.Time) string { return t.UTC().Format("2006-01-02 15:04:05") }

func parseSQLTime(s string) time.Time {
	for _, layout := range []string{"2006-01-02 15:04:05", time.RFC3339Nano, "2006-01-02 15:04:05.999999999-07:00", "2006-01-02T15:04:05Z"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UTC()
		}
	}
	return time.Time{}
}

// Day is the UTC day daily caps count in.
func Day(t time.Time) string { return t.UTC().Format("2006-01-02") }

type RoadRepository struct {
	db *sql.DB

	mu    sync.RWMutex
	means map[string]float64 // the kind's mean light, refreshed by Recompute
}

func NewRoadRepository(db *sql.DB) *RoadRepository {
	return &RoadRepository{db: db, means: map[string]float64{}}
}

// Mean is the kind's average light that every work is shrunk towards.
func (r *RoadRepository) Mean(kind string, fallback float64) float64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	if m, ok := r.means[kind]; ok {
		return m
	}
	return fallback
}

// ---------- accounts ----------

// RoadAccount is what the Ticket Road needs to know about an account.
type RoadAccount struct {
	ID        int64
	Role      string
	AgeBand   string
	CreatedAt time.Time
	Silenced  bool
}

func (r *RoadRepository) Account(ctx context.Context, uid int64) (*RoadAccount, error) {
	var a RoadAccount
	var created string
	var silenced sql.NullString
	err := r.db.QueryRowContext(ctx, `SELECT id, role, age_band, CAST(created_at AS TEXT), silenced_at FROM users WHERE id = ?`, uid).
		Scan(&a.ID, &a.Role, &a.AgeBand, &created, &silenced)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("road account: %w", err)
	}
	a.CreatedAt = parseSQLTime(created)
	a.Silenced = silenced.Valid && silenced.String != ""
	return &a, nil
}

// SetAgeBand records the band once; a band already declared stays.
func (r *RoadRepository) SetAgeBand(ctx context.Context, uid int64, band string) (bool, error) {
	res, err := r.db.ExecContext(ctx, `UPDATE users SET age_band = ? WHERE id = ? AND age_band = ''`, band, uid)
	if err != nil {
		return false, fmt.Errorf("set age band: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

// ---------- rubbings and arrivals ----------

// Rub records the slips rubbed at door slug and that the traveller reached its end, in one
// transaction. It returns the slips that were new.
func (r *RoadRepository) Rub(ctx context.Context, uid int64, slug string, ids []string, now time.Time) ([]string, error) {
	var fresh []string
	err := retryBusy(ctx, func() error {
		fresh = fresh[:0]
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		for _, id := range ids {
			res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO rubbings (user_id, frag, slug, created_at) VALUES (?, ?, ?, ?)`, uid, id, slug, sqlTime(now))
			if err != nil {
				return fmt.Errorf("rub: %w", err)
			}
			if n, _ := res.RowsAffected(); n > 0 {
				fresh = append(fresh, id)
			}
		}
		if err := arriveTx(ctx, tx, uid, light.KindJourney, slug, "end", now); err != nil {
			return err
		}
		return tx.Commit()
	})
	return fresh, err
}

// MergeRubbings replays a guest's rubbings (already validated); idempotent.
func (r *RoadRepository) MergeRubbings(ctx context.Context, uid int64, rubbed map[string]string, now time.Time) (int, error) {
	added := 0
	err := retryBusy(ctx, func() error {
		added = 0
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		for id, slug := range rubbed {
			res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO rubbings (user_id, frag, slug, created_at) VALUES (?, ?, ?, ?)`, uid, id, slug, sqlTime(now))
			if err != nil {
				return fmt.Errorf("merge rubbings: %w", err)
			}
			n, _ := res.RowsAffected()
			added += int(n)
		}
		return tx.Commit()
	})
	return added, err
}

// Rubbings returns slip id -> the door it was rubbed at.
func (r *RoadRepository) Rubbings(ctx context.Context, uid int64) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT frag, slug FROM rubbings WHERE user_id = ?`, uid)
	if err != nil {
		return nil, fmt.Errorf("list rubbings: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var id, slug string
		if err := rows.Scan(&id, &slug); err != nil {
			return nil, err
		}
		out[id] = slug
	}
	return out, rows.Err()
}

// Choice is the option the traveller picked at the fork of door slug (” if none).
func (r *RoadRepository) Choice(ctx context.Context, uid int64, slug string) (string, error) {
	var key string
	err := r.db.QueryRowContext(ctx, `SELECT c.option_key FROM journey_choices c JOIN journeys j ON j.id = c.journey_id WHERE c.user_id = ? AND j.slug = ?`, uid, slug).Scan(&key)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return key, err
}

// Arrive records opening a work (step "view", kept from the first time) or reaching its end
// (step "end", the latest time).
func (r *RoadRepository) Arrive(ctx context.Context, uid int64, kind, id, step string, now time.Time) error {
	return retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		if err := arriveTx(ctx, tx, uid, kind, id, step, now); err != nil {
			return err
		}
		return tx.Commit()
	})
}

func arriveTx(ctx context.Context, tx *sql.Tx, uid int64, kind, id, step string, now time.Time) error {
	var q string
	if step == "end" {
		q = `INSERT INTO arrivals (user_id, work_kind, work_id, first_view_at, arrived_at) VALUES (?, ?, ?, ?, ?)
		     ON CONFLICT(user_id, work_kind, work_id) DO UPDATE SET arrived_at = excluded.arrived_at`
		_, err := tx.ExecContext(ctx, q, uid, kind, id, sqlTime(now), sqlTime(now))
		return err
	}
	q = `INSERT OR IGNORE INTO arrivals (user_id, work_kind, work_id, first_view_at) VALUES (?, ?, ?, ?)`
	_, err := tx.ExecContext(ctx, q, uid, kind, id, sqlTime(now))
	return err
}

// Arrival returns when the traveller first opened a work and last reached its end.
func (r *RoadRepository) Arrival(ctx context.Context, uid int64, kind, id string) (first, arrived time.Time, ok bool, err error) {
	var f string
	var a sql.NullString
	err = r.db.QueryRowContext(ctx, `SELECT first_view_at, arrived_at FROM arrivals WHERE user_id = ? AND work_kind = ? AND work_id = ?`, uid, kind, id).Scan(&f, &a)
	if err == sql.ErrNoRows {
		return time.Time{}, time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, time.Time{}, false, err
	}
	first = parseSQLTime(f)
	if a.Valid {
		arrived = parseSQLTime(a.String)
	}
	return first, arrived, true, nil
}

// HasRead reports whether the traveller has reached the end of any journey at least floor after
// opening it: a lamp only weighs once its lighter has really read one.
func (r *RoadRepository) HasRead(ctx context.Context, uid int64, floor time.Duration) (bool, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM arrivals WHERE user_id = ? AND work_kind = 'journey' AND arrived_at IS NOT NULL
		AND (julianday(arrived_at) - julianday(first_view_at)) * 86400 >= ?`, uid, floor.Seconds()).Scan(&n)
	return n > 0, err
}

// ---------- caps ----------

func takeCap(ctx context.Context, tx *sql.Tx, uid int64, kind, day string, limit int) error {
	var n int
	err := tx.QueryRowContext(ctx, `SELECT n FROM daily_caps WHERE user_id = ? AND day = ? AND kind = ?`, uid, day, kind).Scan(&n)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	if limit > 0 && n >= limit {
		return ErrDailyCap
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO daily_caps (user_id, day, kind, n) VALUES (?, ?, ?, 1)
		ON CONFLICT(user_id, day, kind) DO UPDATE SET n = n + 1`, uid, day, kind)
	return err
}

// ---------- posts ----------

// PostInput is a ticket being hung on the station, already denormalised by the handler.
type PostInput struct {
	Code       string
	UserID     int64
	AuthorHash string
	AliasSlug  string
	AliasNo    int
	Realm      string
	Picks      model.CompositionPicks
	Marks      map[string]int
	Transfer   bool
	SearchText string
	Tags       []string
	Doors      []string
	Now        time.Time
	Cap        int
}

// Publish hangs the ticket. Hanging it again only updates its tags. A ticket the station took
// down cannot be hung again. created reports whether it is new on the station.
func (r *RoadRepository) Publish(ctx context.Context, in PostInput) (created bool, err error) {
	err = retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		var status string
		err = tx.QueryRowContext(ctx, `SELECT status FROM ticket_posts WHERE code = ?`, in.Code).Scan(&status)
		switch {
		case err == nil && status == "removed":
			return ErrPostRemoved
		case err == nil:
			created = false
			if err := writeTags(ctx, tx, in.Code, in.Tags, in.SearchText); err != nil {
				return err
			}
			return tx.Commit()
		case err != sql.ErrNoRows:
			return err
		}
		created = true
		if err := takeCap(ctx, tx, in.UserID, "post", Day(in.Now), in.Cap); err != nil {
			return err
		}
		marks, _ := json.Marshal(in.Marks)
		transfer := 0
		if in.Transfer {
			transfer = 1
		}
		var borrowed int
		_ = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM ticket_borrows WHERE code = ?`, in.Code).Scan(&borrowed)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO ticket_posts (code, user_id, author_hash, alias_slug, alias_no, status, realm, place, hour, season, marks, transfer, search_text, borrowed, posted_at)
			VALUES (?, ?, ?, ?, ?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			in.Code, in.UserID, in.AuthorHash, in.AliasSlug, in.AliasNo, in.Realm, in.Picks.Place, in.Picks.Hour, in.Picks.Season,
			string(marks), transfer, in.SearchText, borrowed, sqlTime(in.Now)); err != nil {
			return fmt.Errorf("insert post: %w", err)
		}
		for _, slug := range in.Doors {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO ticket_post_entrances (slug, code) VALUES (?, ?)`, slug, in.Code); err != nil {
				return err
			}
		}
		if err := writeTags(ctx, tx, in.Code, in.Tags, in.SearchText); err != nil {
			return err
		}
		return tx.Commit()
	})
	return created, err
}

func writeTags(ctx context.Context, tx *sql.Tx, code string, tags []string, search string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM ticket_tags WHERE code = ?`, code); err != nil {
		return err
	}
	for i, t := range tags {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO ticket_tags (code, tag, pos) VALUES (?, ?, ?)`, code, t, i); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET search_text = ? WHERE code = ?`, search, code); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM station_fts WHERE code = ?`, code); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT INTO station_fts (code, body) VALUES (?, ?)`, code, search)
	return err
}

// Unpublish takes the owner's ticket off the station. A ticket the station took down stays down.
func (r *RoadRepository) Unpublish(ctx context.Context, uid int64, code string) (bool, error) {
	var done bool
	err := retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		res, err := tx.ExecContext(ctx, `DELETE FROM ticket_posts WHERE code = ? AND user_id = ? AND status != 'removed'`, code, uid)
		if err != nil {
			return err
		}
		n, _ := res.RowsAffected()
		done = n > 0
		if done {
			if _, err := tx.ExecContext(ctx, `DELETE FROM station_fts WHERE code = ?`, code); err != nil {
				return err
			}
		}
		return tx.Commit()
	})
	return done, err
}

// PostRow is a posted ticket with its slips, tags and light, as the station reads it.
type PostRow struct {
	Code       string
	UserID     int64
	AuthorHash string
	AliasSlug  string
	AliasNo    int
	Status     string
	Realm      string
	Marks      map[string]int
	Transfer   bool
	Borrowed   int
	PostedAt   time.Time
	Picks      model.CompositionPicks
	Tags       []string
	Totals     light.Totals
	Lit        bool // lamp_totals has a row
}

const postColumns = `p.code, p.user_id, p.author_hash, p.alias_slug, p.alias_no, p.status, p.realm, p.marks, p.transfer, p.borrowed, p.posted_at,
	c.place, c.hour, c.season, c.stay, c.ritual, c.keepsake,
	lt.n, lt.w_sum, lt.bright, lt.lower, lt.top_axis, lt.top_stamps`

const postFrom = ` FROM ticket_posts p JOIN compositions c ON c.code = p.code
	LEFT JOIN lamp_totals lt ON lt.work_kind = 'ticket' AND lt.work_id = p.code`

func scanPosts(rows *sql.Rows) ([]PostRow, error) {
	defer rows.Close()
	var out []PostRow
	for rows.Next() {
		var p PostRow
		var marks, posted string
		var transfer int
		var n sql.NullInt64
		var wsum, bright, lower sql.NullFloat64
		var axis, stamps sql.NullString
		pk := &p.Picks
		if err := rows.Scan(&p.Code, &p.UserID, &p.AuthorHash, &p.AliasSlug, &p.AliasNo, &p.Status, &p.Realm, &marks, &transfer, &p.Borrowed, &posted,
			&pk.Place, &pk.Hour, &pk.Season, &pk.Stay, &pk.Ritual, &pk.Keepsake,
			&n, &wsum, &bright, &lower, &axis, &stamps); err != nil {
			return nil, err
		}
		_ = json.Unmarshal([]byte(marks), &p.Marks)
		if p.Marks == nil {
			p.Marks = map[string]int{}
		}
		p.Transfer = transfer == 1
		p.PostedAt = parseSQLTime(posted)
		if n.Valid {
			p.Lit = true
			p.Totals = light.Totals{N: int(n.Int64), WSum: wsum.Float64, Bright: bright.Float64, Lower: lower.Float64, TopAxis: axis.String, TopStamps: light.SplitKeys(stamps.String)}
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// attachTags fills Tags for rows in one query.
func (r *RoadRepository) attachTags(ctx context.Context, posts []PostRow) error {
	if len(posts) == 0 {
		return nil
	}
	idx := map[string]int{}
	args := make([]interface{}, 0, len(posts))
	for i := range posts {
		posts[i].Tags = []string{}
		idx[posts[i].Code] = i
		args = append(args, posts[i].Code)
	}
	rows, err := r.db.QueryContext(ctx, `SELECT code, tag FROM ticket_tags WHERE code IN (`+placeholders(len(args))+`) ORDER BY code, pos`, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var code, tag string
		if err := rows.Scan(&code, &tag); err != nil {
			return err
		}
		posts[idx[code]].Tags = append(posts[idx[code]].Tags, tag)
	}
	return rows.Err()
}

func placeholders(n int) string {
	if n <= 0 {
		return "''"
	}
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

// Post reads one posted ticket in any status (the handler decides who may see it).
func (r *RoadRepository) Post(ctx context.Context, code string) (*PostRow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+` WHERE p.code = ?`, code)
	if err != nil {
		return nil, err
	}
	list, err := scanPosts(rows)
	if err != nil || len(list) == 0 {
		return nil, err
	}
	if err := r.attachTags(ctx, list); err != nil {
		return nil, err
	}
	return &list[0], nil
}

// PostsByUser returns the codes of the user's posted tickets with their status.
func (r *RoadRepository) PostsByUser(ctx context.Context, uid int64) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT code, status FROM ticket_posts WHERE user_id = ?`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var code, status string
		if err := rows.Scan(&code, &status); err != nil {
			return nil, err
		}
		out[code] = status
	}
	return out, rows.Err()
}

// StationQuery is one carriage of the station: filters, search, order and where the last one ended.
type StationQuery struct {
	Realm, Season, Hour, Place, Tag string
	Terms                           []string // lower-cased; matched with FTS when all have three or more characters
	FTS                             bool
	Sort                            string // "bright", "new" or "borrowed"
	After                           *StationCursor
	Limit                           int
	Blocked                         []string // author hashes to leave out
	Unlit                           float64  // the lower bound a ticket nobody has lit yet starts at
}

// StationCursor is the keyset position: the sort value, the posting time and the code.
type StationCursor struct {
	Num  float64
	At   string
	Code string
}

// Station returns up to q.Limit live tickets in order after q.After.
func (r *RoadRepository) Station(ctx context.Context, q StationQuery) ([]PostRow, error) {
	where := []string{"p.status = 'live'"}
	var args []interface{}
	eq := func(col, v string) {
		if v != "" {
			where = append(where, col+" = ?")
			args = append(args, v)
		}
	}
	eq("p.realm", q.Realm)
	eq("p.season", q.Season)
	eq("p.hour", q.Hour)
	eq("p.place", q.Place)
	if q.Tag != "" {
		where = append(where, "EXISTS (SELECT 1 FROM ticket_tags t WHERE t.code = p.code AND t.tag = ?)")
		args = append(args, q.Tag)
	}
	if len(q.Terms) > 0 {
		if q.FTS {
			quoted := make([]string, len(q.Terms))
			for i, t := range q.Terms {
				quoted[i] = `"` + strings.ReplaceAll(t, `"`, `""`) + `"`
			}
			where = append(where, "p.code IN (SELECT code FROM station_fts WHERE station_fts MATCH ?)")
			args = append(args, strings.Join(quoted, " AND "))
		} else {
			for _, t := range q.Terms {
				where = append(where, "p.search_text LIKE ? ESCAPE '\\'")
				args = append(args, "%"+likeEscape(t)+"%")
			}
		}
	}
	if len(q.Blocked) > 0 {
		where = append(where, "p.author_hash NOT IN ("+placeholders(len(q.Blocked))+")")
		for _, b := range q.Blocked {
			args = append(args, b)
		}
	}
	num := "0"
	switch q.Sort {
	case "bright":
		num = fmt.Sprintf("COALESCE(lt.lower, %s)", strconv.FormatFloat(q.Unlit, 'g', -1, 64))
	case "borrowed":
		num = "p.borrowed"
	}
	if c := q.After; c != nil {
		if q.Sort == "new" {
			where = append(where, "(p.posted_at < ? OR (p.posted_at = ? AND p.code < ?))")
			args = append(args, c.At, c.At, c.Code)
		} else {
			where = append(where, "("+num+" < ? OR ("+num+" = ? AND (p.posted_at < ? OR (p.posted_at = ? AND p.code < ?))))")
			args = append(args, c.Num, c.Num, c.At, c.At, c.Code)
		}
	}
	order := "p.posted_at DESC, p.code DESC"
	if q.Sort != "new" {
		order = num + " DESC, " + order
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 24
	}
	args = append(args, limit)
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+` WHERE `+strings.Join(where, " AND ")+` ORDER BY `+order+` LIMIT ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("station: %w", err)
	}
	list, err := scanPosts(rows)
	if err != nil {
		return nil, err
	}
	return list, r.attachTags(ctx, list)
}

// CursorFor is the keyset position after row p in order sort (unlit: where unlit tickets start).
func CursorFor(p PostRow, sort string, unlit float64) StationCursor {
	c := StationCursor{At: sqlTime(p.PostedAt), Code: p.Code}
	switch sort {
	case "bright":
		c.Num = unlit
		if p.Lit {
			c.Num = p.Totals.Lower
		}
	case "borrowed":
		c.Num = float64(p.Borrowed)
	}
	return c
}

func likeEscape(s string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s)
}

// RackCandidates are the latest live tickets that borrowed from door slug.
func (r *RoadRepository) RackCandidates(ctx context.Context, slug string, limit int) ([]PostRow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+`
		JOIN ticket_post_entrances e ON e.code = p.code
		WHERE e.slug = ? AND p.status = 'live' ORDER BY p.posted_at DESC LIMIT ?`, slug, limit)
	if err != nil {
		return nil, err
	}
	list, err := scanPosts(rows)
	if err != nil {
		return nil, err
	}
	return list, r.attachTags(ctx, list)
}

// OwnRack is the traveller's own live tickets that borrowed from door slug: an author always
// finds their ticket on the line, however full it is.
func (r *RoadRepository) OwnRack(ctx context.Context, uid int64, slug string, limit int) ([]PostRow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+`
		JOIN ticket_post_entrances e ON e.code = p.code
		WHERE e.slug = ? AND p.user_id = ? AND p.status = 'live' ORDER BY p.posted_at DESC LIMIT ?`, slug, uid, limit)
	if err != nil {
		return nil, err
	}
	list, err := scanPosts(rows)
	if err != nil {
		return nil, err
	}
	return list, r.attachTags(ctx, list)
}

// DriftCandidates are live tickets that borrowed from doors written for type code (content
// affinity of 4 or more). The authors' own types are never read.
func (r *RoadRepository) DriftCandidates(ctx context.Context, code string, limit int) ([]PostRow, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+`
		WHERE p.status = 'live' AND p.code IN (
			SELECT e.code FROM ticket_post_entrances e
			JOIN journeys j ON j.slug = e.slug
			JOIN journey_mbti jm ON jm.journey_id = j.id AND jm.compatibility_score >= 4
			JOIN mbti_types mt ON mt.id = jm.mbti_id AND mt.code = ?)
		ORDER BY p.posted_at DESC LIMIT ?`, code, limit)
	if err != nil {
		return nil, err
	}
	list, err := scanPosts(rows)
	if err != nil {
		return nil, err
	}
	return list, r.attachTags(ctx, list)
}

// Borrow records that uid set out from ticket code; the first time per traveller counts.
func (r *RoadRepository) Borrow(ctx context.Context, code string, uid int64, now time.Time) error {
	return retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		res, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO ticket_borrows (code, user_id, created_at) VALUES (?, ?, ?)`, code, uid, sqlTime(now))
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			if _, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET borrowed = borrowed + 1 WHERE code = ?`, code); err != nil {
				return err
			}
		}
		return tx.Commit()
	})
}

// ---------- blocks ----------

func (r *RoadRepository) Blocks(ctx context.Context, uid int64) ([]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT author_hash FROM blocks WHERE user_id = ? ORDER BY author_hash`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var h string
		if err := rows.Scan(&h); err != nil {
			return nil, err
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

func (r *RoadRepository) Block(ctx context.Context, uid int64, hash string, on bool, now time.Time) error {
	return retryBusy(ctx, func() error {
		var err error
		if on {
			_, err = r.db.ExecContext(ctx, `INSERT OR IGNORE INTO blocks (user_id, author_hash, created_at) VALUES (?, ?, ?)`, uid, hash, sqlTime(now))
		} else {
			_, err = r.db.ExecContext(ctx, `DELETE FROM blocks WHERE user_id = ? AND author_hash = ?`, uid, hash)
		}
		return err
	})
}

// ---------- lamps ----------

// LampRow is one traveller's lamp as stored.
type LampRow struct {
	Real, Moved, Fit int
	Stamp            string
	Flags            []string
	Weight           float64
	CreatedAt        time.Time
}

func (r *RoadRepository) Lamp(ctx context.Context, kind, id string, uid int64) (*LampRow, error) {
	var l LampRow
	var real, moved, fit sql.NullInt64
	var flags, created string
	err := r.db.QueryRowContext(ctx, `SELECT real, moved, fit, stamp, flags, weight, created_at FROM lamps WHERE work_kind = ? AND work_id = ? AND user_id = ?`, kind, id, uid).
		Scan(&real, &moved, &fit, &l.Stamp, &flags, &l.Weight, &created)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	l.Real, l.Moved, l.Fit = int(real.Int64), int(moved.Int64), int(fit.Int64)
	l.Flags = light.SplitKeys(flags)
	l.CreatedAt = parseSQLTime(created)
	return &l, nil
}

// LightInput is a lamp being lit or adjusted.
type LightInput struct {
	Kind, ID         string
	UserID           int64
	Real, Moved, Fit int
	Stamp            string
	Flags            []string
	Weight           float64
	Now              time.Time
	Rules            light.Rules
}

func nullable(v int) interface{} {
	if v <= 0 {
		return nil
	}
	return v
}

// Light upserts the lamp and recomputes the work's totals in one transaction.
func (r *RoadRepository) Light(ctx context.Context, in LightInput) (light.Totals, error) {
	var totals light.Totals
	m := r.Mean(in.Kind, in.Rules.PriorMean)
	err := retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		var created string
		err = tx.QueryRowContext(ctx, `SELECT created_at FROM lamps WHERE work_kind = ? AND work_id = ? AND user_id = ?`, in.Kind, in.ID, in.UserID).Scan(&created)
		switch {
		case err == sql.ErrNoRows:
			if err := takeCap(ctx, tx, in.UserID, "lamp", Day(in.Now), in.Rules.LampsPerDay); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO lamps (work_kind, work_id, user_id, real, moved, fit, stamp, flags, weight, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				in.Kind, in.ID, in.UserID, nullable(in.Real), nullable(in.Moved), nullable(in.Fit), in.Stamp, light.JoinKeys(in.Flags), in.Weight, sqlTime(in.Now), sqlTime(in.Now)); err != nil {
				return fmt.Errorf("insert lamp: %w", err)
			}
		case err != nil:
			return err
		default:
			if in.Now.Sub(parseSQLTime(created)) > in.Rules.RelightWindow {
				return ErrLampLocked
			}
			if _, err := tx.ExecContext(ctx, `UPDATE lamps SET real = ?, moved = ?, fit = ?, stamp = ?, flags = ?, weight = ?, updated_at = ?
				WHERE work_kind = ? AND work_id = ? AND user_id = ?`,
				nullable(in.Real), nullable(in.Moved), nullable(in.Fit), in.Stamp, light.JoinKeys(in.Flags), in.Weight, sqlTime(in.Now), in.Kind, in.ID, in.UserID); err != nil {
				return fmt.Errorf("update lamp: %w", err)
			}
		}
		totals, err = recomputeWork(ctx, tx, in.Kind, in.ID, m, in.Rules, in.Now)
		if err != nil {
			return err
		}
		return tx.Commit()
	})
	return totals, err
}

type execQuerier interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
}

func recomputeWork(ctx context.Context, q execQuerier, kind, id string, m float64, rules light.Rules, now time.Time) (light.Totals, error) {
	rows, err := q.QueryContext(ctx, `SELECT COALESCE(real, 0), COALESCE(moved, 0), COALESCE(fit, 0), stamp, weight FROM lamps WHERE work_kind = ? AND work_id = ?`, kind, id)
	if err != nil {
		return light.Totals{}, err
	}
	var lamps []light.Lamp
	for rows.Next() {
		var l light.Lamp
		if err := rows.Scan(&l.Real, &l.Moved, &l.Fit, &l.Stamp, &l.Weight); err != nil {
			rows.Close()
			return light.Totals{}, err
		}
		lamps = append(lamps, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return light.Totals{}, err
	}
	t := light.Sum(lamps, m, rules)
	_, err = q.ExecContext(ctx, `
		INSERT INTO lamp_totals (work_kind, work_id, n, w_sum, real_m, moved_m, fit_m, bright, lower, top_axis, top_stamps, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(work_kind, work_id) DO UPDATE SET n = excluded.n, w_sum = excluded.w_sum, real_m = excluded.real_m, moved_m = excluded.moved_m,
		  fit_m = excluded.fit_m, bright = excluded.bright, lower = excluded.lower, top_axis = excluded.top_axis, top_stamps = excluded.top_stamps,
		  updated_at = excluded.updated_at`,
		kind, id, t.N, t.WSum, t.RealM, t.MovedM, t.FitM, t.Bright, t.Lower, t.TopAxis, light.JoinKeys(t.TopStamps), sqlTime(now))
	return t, err
}

// Totals reads a work's aggregate (zero Totals when nobody lit it).
func (r *RoadRepository) Totals(ctx context.Context, kind, id string) (light.Totals, error) {
	var t light.Totals
	var stamps string
	err := r.db.QueryRowContext(ctx, `SELECT n, w_sum, real_m, moved_m, fit_m, bright, lower, top_axis, top_stamps FROM lamp_totals WHERE work_kind = ? AND work_id = ?`, kind, id).
		Scan(&t.N, &t.WSum, &t.RealM, &t.MovedM, &t.FitM, &t.Bright, &t.Lower, &t.TopAxis, &stamps)
	if err == sql.ErrNoRows {
		return light.Totals{TopStamps: []string{}}, nil
	}
	t.TopStamps = light.SplitKeys(stamps)
	return t, err
}

// Ledger is the author's full view of a work's light, without who lit it.
type Ledger struct {
	N      int               `json:"n"`
	Axes   map[string][5]int `json:"axes"`   // wick -> count per level 1..5
	Stamps map[string]int    `json:"stamps"` // stamp -> count
	Flags  map[string]int    `json:"flags"`  // private mismatch flags -> count
}

func (r *RoadRepository) Ledger(ctx context.Context, kind, id string) (*Ledger, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT COALESCE(real, 0), COALESCE(moved, 0), COALESCE(fit, 0), stamp, flags FROM lamps WHERE work_kind = ? AND work_id = ? AND weight > 0`, kind, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	l := &Ledger{Axes: map[string][5]int{}, Stamps: map[string]int{}, Flags: map[string]int{}}
	for rows.Next() {
		var real, moved, fit int
		var stamp, flags string
		if err := rows.Scan(&real, &moved, &fit, &stamp, &flags); err != nil {
			return nil, err
		}
		l.N++
		for i, v := range []int{real, moved, fit} {
			if v >= 1 && v <= 5 {
				a := l.Axes[light.Axes[i]]
				a[v-1]++
				l.Axes[light.Axes[i]] = a
			}
		}
		if stamp != "" {
			l.Stamps[stamp]++
		}
		for _, f := range light.SplitKeys(flags) {
			l.Flags[f]++
		}
	}
	return l, rows.Err()
}

// Recompute is the nightly pass: lamp weights from account standing (age, a journey really
// read, not silenced), halved for pairs who keep lighting each other brightly, then each kind's
// mean and every work's totals. It works in batches so reads are never starved.
func (r *RoadRepository) Recompute(ctx context.Context, rules light.Rules, now time.Time) error {
	minAgeDays := rules.MinAccountAge.Hours() / 24
	floor := rules.JourneyFloor.Seconds()
	var maxID int64
	if err := r.db.QueryRowContext(ctx, `SELECT COALESCE(MAX(id), 0) FROM lamps`).Scan(&maxID); err != nil {
		return err
	}
	for lo := int64(0); lo <= maxID; lo += 500 {
		if err := retryBusy(ctx, func() error {
			_, err := r.db.ExecContext(ctx, `
				UPDATE lamps SET weight = (
					SELECT CASE
						WHEN u.silenced_at IS NOT NULL THEN 0
						WHEN julianday(?) - julianday(u.created_at) < ? THEN 0
						WHEN NOT EXISTS (SELECT 1 FROM arrivals a WHERE a.user_id = u.id AND a.work_kind = 'journey' AND a.arrived_at IS NOT NULL
						                 AND (julianday(a.arrived_at) - julianday(a.first_view_at)) * 86400 >= ?) THEN 0
						ELSE 1 END
					FROM users u WHERE u.id = lamps.user_id)
				WHERE id > ? AND id <= ?`, sqlTime(now), minAgeDays, floor, lo, lo+500)
			return err
		}); err != nil {
			return fmt.Errorf("recompute weights: %w", err)
		}
	}
	// Two accounts that each lit three or more of the other's tickets at 4+ weigh half on those lamps.
	if err := retryBusy(ctx, func() error {
		_, err := r.db.ExecContext(ctx, `
			WITH warm AS (
				SELECT l.id, l.user_id AS rater, p.user_id AS author FROM lamps l
				JOIN ticket_posts p ON l.work_kind = 'ticket' AND p.code = l.work_id
				WHERE l.weight > 0 AND (COALESCE(l.real, 0) + COALESCE(l.moved, 0) + COALESCE(l.fit, 0))
				      >= 4 * ((l.real IS NOT NULL) + (l.moved IS NOT NULL) + (l.fit IS NOT NULL))
				  AND ((l.real IS NOT NULL) + (l.moved IS NOT NULL) + (l.fit IS NOT NULL)) > 0),
			pairs AS (SELECT rater, author FROM warm GROUP BY rater, author HAVING COUNT(*) >= 3)
			UPDATE lamps SET weight = weight * 0.5 WHERE id IN (
				SELECT w.id FROM warm w
				JOIN pairs a ON a.rater = w.rater AND a.author = w.author
				JOIN pairs b ON b.rater = w.author AND b.author = w.rater)`)
		return err
	}); err != nil {
		return fmt.Errorf("recompute reciprocity: %w", err)
	}
	means := map[string]float64{}
	for _, kind := range []string{light.KindTicket, light.KindJourney} {
		var sx, sw sql.NullFloat64
		if err := r.db.QueryRowContext(ctx, `
			SELECT SUM(weight * (COALESCE(real, 0) + COALESCE(moved, 0) + COALESCE(fit, 0)) * 1.0 / ((real IS NOT NULL) + (moved IS NOT NULL) + (fit IS NOT NULL))),
			       SUM(weight)
			FROM lamps WHERE work_kind = ? AND weight > 0 AND ((real IS NOT NULL) + (moved IS NOT NULL) + (fit IS NOT NULL)) > 0`, kind).Scan(&sx, &sw); err != nil {
			return err
		}
		const settle = 20.0 // the prior mean holds until about twenty lamps of the kind are lit
		means[kind] = (settle*rules.PriorMean + sx.Float64) / (settle + sw.Float64)
	}
	r.mu.Lock()
	r.means = means
	r.mu.Unlock()
	works, err := r.litWorks(ctx)
	if err != nil {
		return err
	}
	for start := 0; start < len(works); start += 500 {
		end := start + 500
		if end > len(works) {
			end = len(works)
		}
		batch := works[start:end]
		if err := retryBusy(ctx, func() error {
			tx, err := r.db.BeginTx(ctx, nil)
			if err != nil {
				return err
			}
			defer func() { _ = tx.Rollback() }()
			for _, w := range batch {
				if _, err := recomputeWork(ctx, tx, w[0], w[1], means[w[0]], rules, now); err != nil {
					return err
				}
			}
			return tx.Commit()
		}); err != nil {
			return fmt.Errorf("recompute totals: %w", err)
		}
	}
	return nil
}

func (r *RoadRepository) litWorks(ctx context.Context) ([][2]string, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT DISTINCT work_kind, work_id FROM lamps`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out [][2]string
	for rows.Next() {
		var k, id string
		if err := rows.Scan(&k, &id); err != nil {
			return nil, err
		}
		out = append(out, [2]string{k, id})
	}
	return out, rows.Err()
}

// ---------- reports and review ----------

// Report records a report; three trusted reporters dim the ticket until review. dimmed reports
// whether this report did it.
func (r *RoadRepository) Report(ctx context.Context, code string, uid int64, reason string, trusted bool, now time.Time, rules light.Rules) (dimmed bool, err error) {
	err = retryBusy(ctx, func() error {
		dimmed = false
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		var exists int
		_ = tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM reports WHERE work_kind = 'ticket' AND work_id = ? AND reporter_id = ?`, code, uid).Scan(&exists)
		if exists == 0 {
			if err := takeCap(ctx, tx, uid, "report", Day(now), rules.ReportsPerDay); err != nil {
				return err
			}
		}
		t := 0
		if trusted {
			t = 1
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO reports (work_kind, work_id, reporter_id, reason, trusted, created_at) VALUES ('ticket', ?, ?, ?, ?, ?)
			ON CONFLICT(work_kind, work_id, reporter_id) DO UPDATE SET reason = excluded.reason, trusted = excluded.trusted, resolved_at = NULL`, code, uid, reason, t, sqlTime(now)); err != nil {
			return err
		}
		var n int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM reports WHERE work_kind = 'ticket' AND work_id = ? AND trusted = 1 AND resolved_at IS NULL`, code).Scan(&n); err != nil {
			return err
		}
		if n >= rules.DimAfter {
			res, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET status = 'hidden' WHERE code = ? AND status = 'live'`, code)
			if err != nil {
				return err
			}
			if k, _ := res.RowsAffected(); k > 0 {
				dimmed = true
			}
		}
		return tx.Commit()
	})
	return dimmed, err
}

// QueueItem is a ticket waiting for the station master: dimmed, or reported and still live.
type QueueItem struct {
	Post    PostRow
	Reasons map[string]int
	Reports int
	Trusted int
}

func (r *RoadRepository) Queue(ctx context.Context) ([]QueueItem, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+postColumns+postFrom+`
		WHERE p.status = 'hidden' OR EXISTS (SELECT 1 FROM reports rp WHERE rp.work_id = p.code AND rp.resolved_at IS NULL)
		ORDER BY p.status = 'hidden' DESC, p.posted_at DESC LIMIT 200`)
	if err != nil {
		return nil, err
	}
	posts, err := scanPosts(rows)
	if err != nil {
		return nil, err
	}
	if err := r.attachTags(ctx, posts); err != nil {
		return nil, err
	}
	out := make([]QueueItem, len(posts))
	idx := map[string]int{}
	args := make([]interface{}, len(posts))
	for i, p := range posts {
		out[i] = QueueItem{Post: p, Reasons: map[string]int{}}
		idx[p.Code] = i
		args[i] = p.Code
	}
	if len(posts) == 0 {
		return out, nil
	}
	rrows, err := r.db.QueryContext(ctx, `SELECT work_id, reason, trusted FROM reports WHERE resolved_at IS NULL AND work_id IN (`+placeholders(len(args))+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rrows.Close()
	for rrows.Next() {
		var code, reason string
		var trusted int
		if err := rrows.Scan(&code, &reason, &trusted); err != nil {
			return nil, err
		}
		it := &out[idx[code]]
		it.Reasons[reason]++
		it.Reports++
		it.Trusted += trusted
	}
	return out, rrows.Err()
}

// Review applies the station master's decision: restore (back on the station), remove (down
// for good) or silence (remove every ticket of the author and take their lamps down, recomputing
// the light of everything they lit).
func (r *RoadRepository) Review(ctx context.Context, code, action string, now time.Time, rules light.Rules) error {
	return retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback() }()
		var owner int64
		if err := tx.QueryRowContext(ctx, `SELECT user_id FROM ticket_posts WHERE code = ?`, code).Scan(&owner); err != nil {
			if err == sql.ErrNoRows {
				return sql.ErrNoRows
			}
			return err
		}
		resolve := func(codes string, args ...interface{}) error {
			_, err := tx.ExecContext(ctx, `UPDATE reports SET resolved_at = ? WHERE resolved_at IS NULL AND work_id IN (`+codes+`)`, append([]interface{}{sqlTime(now)}, args...)...)
			return err
		}
		switch action {
		case "restore":
			if _, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET status = 'live', reviewed_at = ? WHERE code = ?`, sqlTime(now), code); err != nil {
				return err
			}
			if err := resolve("?", code); err != nil {
				return err
			}
		case "remove":
			if _, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET status = 'removed', reviewed_at = ? WHERE code = ?`, sqlTime(now), code); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM station_fts WHERE code = ?`, code); err != nil {
				return err
			}
			if err := resolve("?", code); err != nil {
				return err
			}
		case "silence":
			if _, err := tx.ExecContext(ctx, `UPDATE users SET silenced_at = ? WHERE id = ?`, sqlTime(now), owner); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE ticket_posts SET status = 'removed', reviewed_at = ? WHERE user_id = ?`, sqlTime(now), owner); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM station_fts WHERE code IN (SELECT code FROM ticket_posts WHERE user_id = ?)`, owner); err != nil {
				return err
			}
			if err := resolve("SELECT code FROM ticket_posts WHERE user_id = ?", owner); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `UPDATE lamps SET weight = 0 WHERE user_id = ?`, owner); err != nil {
				return err
			}
			works, err := tx.QueryContext(ctx, `SELECT DISTINCT work_kind, work_id FROM lamps WHERE user_id = ?`, owner)
			if err != nil {
				return err
			}
			var list [][2]string
			for works.Next() {
				var k, id string
				if err := works.Scan(&k, &id); err != nil {
					works.Close()
					return err
				}
				list = append(list, [2]string{k, id})
			}
			works.Close()
			for _, w := range list {
				if _, err := recomputeWork(ctx, tx, w[0], w[1], r.Mean(w[0], rules.PriorMean), rules, now); err != nil {
					return err
				}
			}
		default:
			return fmt.Errorf("unknown review action %q", action)
		}
		return tx.Commit()
	})
}
