// Package content holds the authored journeys ("entrances"): one bilingual JSON file per
// journey under entrances/, compiled into the binary and synced into SQLite at startup.
//
// The JSON files are the source of truth for every journey they describe; db/seed.sql keeps
// the original rows for journeys that have not been rewritten yet. See docs/content/SCHEMA.md.
package content

import (
	"context"
	"crypto/sha1"
	"database/sql"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

//go:embed entrances/*.json
var files embed.FS

// Entrance is one journey file.
type Entrance struct {
	Slug     string `json:"slug"`
	Entrance Meta   `json:"entrance"`
	Journey  Base   `json:"journey"`
	Cover    Cover  `json:"cover"`
	ZH       Text   `json:"zh"`
	EN       Text   `json:"en"`

	hash string
}

// Meta is language-independent world data.
type Meta struct {
	No      int      `json:"no"`
	Realm   string   `json:"realm"`
	Pace    string   `json:"pace"`
	Scale   string   `json:"scale"`
	Seasons []string `json:"seasons"`
	Time    string   `json:"time"`
}

// Base mirrors the columns of the journeys table plus tag and MBTI links.
type Base struct {
	FantasyType string         `json:"fantasy_type"`
	VisualStyle string         `json:"visual_style"`
	Adventure   int            `json:"adventure_index"`
	Obscurity   int            `json:"obscurity_level"`
	Risk        int            `json:"risk_level"`
	Price       int            `json:"price"`
	Tags        []string       `json:"tags"`
	MBTI        map[string]int `json:"mbti"`
}

// Cover records where the image came from and under which licence it is used.
type Cover struct {
	Path    string `json:"path"`
	License string `json:"license"`
	Source  string `json:"source"`
}

// Text is the copy for one language.
type Text struct {
	Title    string    `json:"title"`
	Subtitle string    `json:"subtitle"`
	Hook     string    `json:"hook"`
	Region   string    `json:"region"`
	Moods    []string  `json:"moods"`
	Opens    string    `json:"opens"`
	Role     string    `json:"role"`
	Premise  string    `json:"premise"`
	Mission  string    `json:"mission"`
	Chapters []Chapter `json:"chapters"`
	Choice   *Choice   `json:"choice,omitempty"`
	Ending   string    `json:"ending"`
	Facts    []Fact    `json:"facts"`
	Fiction  string    `json:"fiction"`
}

type Chapter struct {
	Title      string   `json:"title"`
	Paragraphs []string `json:"paragraphs"`
}

type Choice struct {
	Prompt  string   `json:"prompt"`
	Options []Option `json:"options"`
}

type Option struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Keeps string `json:"keeps"` // what you leave with if you choose this
}

type Fact struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

// Body is the localized narrative stored in journey_content and returned by the API.
type Body struct {
	Opens    string    `json:"opens"`
	Role     string    `json:"role"`
	Premise  string    `json:"premise"`
	Mission  string    `json:"mission"`
	Chapters []Chapter `json:"chapters"`
	Choice   *Choice   `json:"choice,omitempty"`
	Ending   string    `json:"ending"`
	Facts    []Fact    `json:"facts"`
	Fiction  string    `json:"fiction"`
}

func (t Text) body() Body {
	return Body{Opens: t.Opens, Role: t.Role, Premise: t.Premise, Mission: t.Mission, Chapters: t.Chapters, Choice: t.Choice, Ending: t.Ending, Facts: t.Facts, Fiction: t.Fiction}
}

// The controlled vocabulary of the world. Labels live in web/js/i18n.js (entrance.*);
// fantasy types, visual styles and tags mirror the seed data in db/seed.sql.
var (
	Realms       = []string{"mirror-salt", "fire-stone", "ice-night", "sand-stars", "mist-temple", "water-deep", "city-rules", "old-roads"}
	Paces        = []string{"hour", "day", "multi-day"}
	Scales       = []string{"near", "far", "polar"}
	Seasons      = []string{"spring", "summer", "autumn", "winter", "rainy", "dry", "polar-night", "midnight-sun", "any"}
	Times        = []string{"predawn", "dawn", "morning", "noon", "afternoon", "dusk", "blue-hour", "night", "midnight", "any"}
	FantasyTypes = []string{"extreme", "solitude", "visual", "culture", "spiritual", "night"}
	VisualStyles = []string{"raw", "surreal", "minimal", "dramatic"}
	Tags         = []string{"extreme", "solitude", "visual", "culture", "hidden", "nature", "spiritual", "night"}
)

// Load reads every embedded entrance, sorted by entrance number.
func Load() ([]Entrance, error) {
	paths, err := fs.Glob(files, "entrances/*.json")
	if err != nil {
		return nil, err
	}
	out := make([]Entrance, 0, len(paths))
	for _, p := range paths {
		raw, err := files.ReadFile(p)
		if err != nil {
			return nil, err
		}
		var e Entrance
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&e); err != nil {
			return nil, fmt.Errorf("%s: %w", p, err)
		}
		sum := sha1.Sum(raw)
		e.hash = hex.EncodeToString(sum[:])
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Entrance.No < out[j].Entrance.No })
	return out, nil
}

var (
	mbtiCode = regexp.MustCompile(`\b[EI][NS][FT][JP]\b`)
	// Copy must show why a journey fits, never tell: no type codes, no trait vocabulary, no lecturing.
	bannedZH = []string{"MBTI", "人格", "性格", "内向", "外向", "理性", "感性", "直觉型", "因为你是", "作为一个", "适合你这种", "你天生", "你这样的人"}
	bannedEN = []string{"mbti", "personality", "introvert", "extrovert", "because you are", "because you're", "your type", "people like you"}
)

// Validate returns human-readable problems; an empty slice means the entrance can ship.
func Validate(e Entrance) []string {
	var p []string
	add := func(format string, a ...interface{}) { p = append(p, fmt.Sprintf(format, a...)) }

	if e.Slug == "" {
		add("slug is required")
	}
	if e.Entrance.No < 1 || e.Entrance.No > 100 {
		add("entrance number must be 1-100")
	}
	if !contains(Realms, e.Entrance.Realm) {
		add("unknown realm %q", e.Entrance.Realm)
	}
	if !contains(Paces, e.Entrance.Pace) {
		add("unknown pace %q", e.Entrance.Pace)
	}
	if !contains(Scales, e.Entrance.Scale) {
		add("unknown scale %q", e.Entrance.Scale)
	}
	if len(e.Entrance.Seasons) == 0 || e.Entrance.Time == "" {
		add("opening condition needs seasons and time")
	}
	for _, v := range e.Entrance.Seasons {
		if !contains(Seasons, v) {
			add("unknown season %q", v)
		}
	}
	if e.Entrance.Time != "" && !contains(Times, e.Entrance.Time) {
		add("unknown time %q", e.Entrance.Time)
	}
	if !contains(FantasyTypes, e.Journey.FantasyType) {
		add("unknown fantasy_type %q", e.Journey.FantasyType)
	}
	if !contains(VisualStyles, e.Journey.VisualStyle) {
		add("unknown visual_style %q", e.Journey.VisualStyle)
	}
	if len(e.Journey.Tags) == 0 {
		add("journey needs at least one tag")
	}
	for _, v := range e.Journey.Tags {
		if !contains(Tags, v) {
			add("unknown tag %q", v)
		}
	}
	if n := len(e.Journey.MBTI); n < 2 || n > 4 {
		add("journey needs 2-4 MBTI affinities, has %d", n)
	}
	for code, score := range e.Journey.MBTI {
		if !mbtiCode.MatchString(code) || len(code) != 4 {
			add("invalid MBTI code %q", code)
		}
		if score < 1 || score > 5 {
			add("MBTI %s score must be 1-5", code)
		}
	}
	if e.Journey.Adventure < 1 || e.Journey.Adventure > 10 || e.Journey.Obscurity < 1 || e.Journey.Obscurity > 10 || e.Journey.Risk < 1 || e.Journey.Risk > 5 {
		add("adventure/obscurity must be 1-10 and risk 1-5")
	}
	if e.Journey.Price <= 0 {
		add("price must be positive")
	}
	if e.Cover.Path == "" || e.Cover.License == "" || e.Cover.Source == "" {
		add("cover needs path, license and source")
	}

	for _, lang := range []struct {
		name   string
		t      Text
		banned []string
	}{{"zh", e.ZH, bannedZH}, {"en", e.EN, bannedEN}} {
		t := lang.t
		for field, v := range map[string]string{"title": t.Title, "hook": t.Hook, "region": t.Region, "opens": t.Opens, "role": t.Role, "premise": t.Premise, "mission": t.Mission, "ending": t.Ending, "fiction": t.Fiction} {
			if strings.TrimSpace(v) == "" {
				add("%s.%s is required", lang.name, field)
			}
		}
		if len(t.Moods) == 0 {
			add("%s.moods is required", lang.name)
		}
		if n := len(t.Chapters); n < 2 || n > 5 {
			add("%s needs 2-5 chapters, has %d", lang.name, n)
		}
		for i, c := range t.Chapters {
			if c.Title == "" || len(c.Paragraphs) == 0 {
				add("%s chapter %d needs a title and paragraphs", lang.name, i+1)
			}
		}
		if t.Choice == nil || len(t.Choice.Options) < 2 || len(t.Choice.Options) > 3 {
			add("%s needs one choice with 2-3 options", lang.name)
		}
		if len(t.Facts) < 2 {
			add("%s needs at least 2 sourced facts", lang.name)
		}
		for _, f := range t.Facts {
			if u, err := url.Parse(f.Source); err != nil || u.Scheme != "https" || u.Host == "" {
				add("%s fact %q needs an https source", lang.name, short(f.Text))
			}
		}
		for _, s := range narrative(t) {
			lower := strings.ToLower(s)
			if m := mbtiCode.FindString(s); m != "" {
				add("%s copy names a type (%s): %q", lang.name, m, short(s))
			}
			for _, w := range lang.banned {
				if strings.Contains(lower, strings.ToLower(w)) {
					add("%s copy tells instead of shows (%q): %q", lang.name, w, short(s))
				}
			}
		}
	}
	if e.ZH.Choice != nil && e.EN.Choice != nil && !sameKeys(e.ZH.Choice.Options, e.EN.Choice.Options) {
		add("choice keys differ between zh and en")
	}
	return p
}

// narrative is the reader-facing story copy that the show-don't-tell lint applies to.
func narrative(t Text) []string {
	out := []string{t.Title, t.Subtitle, t.Hook, t.Role, t.Premise, t.Mission, t.Ending}
	for _, c := range t.Chapters {
		out = append(out, c.Title)
		out = append(out, c.Paragraphs...)
	}
	if t.Choice != nil {
		out = append(out, t.Choice.Prompt)
		for _, o := range t.Choice.Options {
			out = append(out, o.Label, o.Keeps)
		}
	}
	return out
}

// Sync upserts every entrance into the database. Unchanged files are skipped (content hash),
// so restarts do not touch updated_at.
func Sync(ctx context.Context, db *sql.DB) error {
	entrances, err := Load()
	if err != nil {
		return err
	}
	for _, e := range entrances {
		if problems := Validate(e); len(problems) > 0 {
			return fmt.Errorf("entrance %s is invalid: %s", e.Slug, strings.Join(problems, "; "))
		}
		if err := syncOne(ctx, db, e); err != nil {
			return fmt.Errorf("sync entrance %s: %w", e.Slug, err)
		}
	}
	return nil
}

func syncOne(ctx context.Context, db *sql.DB, e Entrance) error {
	var current string
	err := db.QueryRowContext(ctx, `SELECT en.content_hash FROM journey_entrances en JOIN journeys j ON j.id = en.journey_id WHERE j.slug = ?`, e.Slug).Scan(&current)
	if err == nil && current == e.hash {
		return nil
	}
	if err != nil && err != sql.ErrNoRows {
		return err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	moodsZH, _ := json.Marshal(e.ZH.Moods)
	moodsEN, _ := json.Marshal(e.EN.Moods)
	story := func(t Text) string {
		parts := []string{t.Premise}
		for _, c := range t.Chapters {
			parts = append(parts, c.Paragraphs...)
		}
		return strings.Join(parts, "\n")
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO journeys (title, slug, subtitle, story_hook, story, region, fantasy_type, visual_style,
		                      adventure_index, obscurity_level, risk_level, mood_keywords, image_path, price)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(slug) DO UPDATE SET
		  title = excluded.title, subtitle = excluded.subtitle, story_hook = excluded.story_hook, story = excluded.story,
		  region = excluded.region, fantasy_type = excluded.fantasy_type, visual_style = excluded.visual_style,
		  adventure_index = excluded.adventure_index, obscurity_level = excluded.obscurity_level, risk_level = excluded.risk_level,
		  mood_keywords = excluded.mood_keywords, image_path = excluded.image_path, price = excluded.price`,
		e.ZH.Title, e.Slug, e.ZH.Subtitle, e.ZH.Hook, story(e.ZH), e.ZH.Region, e.Journey.FantasyType, e.Journey.VisualStyle,
		e.Journey.Adventure, e.Journey.Obscurity, e.Journey.Risk, string(moodsZH), e.Cover.Path, e.Journey.Price); err != nil {
		return err
	}
	var id int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM journeys WHERE slug = ?`, e.Slug).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO journey_translations (journey_id, locale, title, subtitle, story_hook, story, region, mood_keywords)
		VALUES (?, 'en', ?, ?, ?, ?, ?, ?)
		ON CONFLICT(journey_id, locale) DO UPDATE SET title = excluded.title, subtitle = excluded.subtitle,
		  story_hook = excluded.story_hook, story = excluded.story, region = excluded.region, mood_keywords = excluded.mood_keywords`,
		id, e.EN.Title, e.EN.Subtitle, e.EN.Hook, story(e.EN), e.EN.Region, string(moodsEN)); err != nil {
		return err
	}
	seasons, _ := json.Marshal(e.Entrance.Seasons)
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO journey_entrances (journey_id, no, realm, pace, scale, seasons, time_of_day, cover_license, cover_source, content_hash)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(journey_id) DO UPDATE SET no = excluded.no, realm = excluded.realm, pace = excluded.pace, scale = excluded.scale,
		  seasons = excluded.seasons, time_of_day = excluded.time_of_day, cover_license = excluded.cover_license,
		  cover_source = excluded.cover_source, content_hash = excluded.content_hash`,
		id, e.Entrance.No, e.Entrance.Realm, e.Entrance.Pace, e.Entrance.Scale, string(seasons), e.Entrance.Time, e.Cover.License, e.Cover.Source, e.hash); err != nil {
		return err
	}
	for locale, t := range map[string]Text{"zh": e.ZH, "en": e.EN} {
		body, _ := json.Marshal(t.body())
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO journey_content (journey_id, locale, body) VALUES (?, ?, ?)
			ON CONFLICT(journey_id, locale) DO UPDATE SET body = excluded.body`, id, locale, string(body)); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM journey_tags WHERE journey_id = ?`, id); err != nil {
		return err
	}
	for _, tag := range e.Journey.Tags {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO journey_tags (journey_id, tag_id) SELECT ?, id FROM tags WHERE slug = ?`, id, tag); err != nil {
			return err
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM journey_mbti WHERE journey_id = ?`, id); err != nil {
		return err
	}
	for code, score := range e.Journey.MBTI {
		if _, err := tx.ExecContext(ctx, `INSERT INTO journey_mbti (journey_id, mbti_id, compatibility_score) SELECT ?, id, ? FROM mbti_types WHERE code = ?`, id, score, code); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func sameKeys(a, b []Option) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i].Key != b[i].Key {
			return false
		}
	}
	return true
}

func short(s string) string {
	r := []rune(s)
	if len(r) > 24 {
		return string(r[:24]) + "…"
	}
	return s
}
