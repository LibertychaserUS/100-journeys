package repository

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/model"
)

var (
	// ErrCompositionTaken: the client id already belongs to another user's ticket.
	ErrCompositionTaken = errors.New("composition id already used")
	// ErrCompositionLimit: the user already keeps the maximum number of tickets.
	ErrCompositionLimit = errors.New("composition limit reached")
)

// CompositionRepository stores tickets kept in the compose game.
type CompositionRepository interface {
	// Upsert creates the ticket, or updates its picks when the same user keeps the same id again.
	// created reports which happened. limit caps how many tickets one user can keep.
	Upsert(ctx context.Context, c *model.Composition, limit int) (saved *model.Composition, created bool, err error)
	ListByUser(ctx context.Context, userID int64) ([]model.Composition, error)
	Delete(ctx context.Context, userID int64, id string) (bool, error)
	GetByCode(ctx context.Context, code string) (*model.Composition, error)
}

type sqliteCompositionRepo struct {
	db *sql.DB
}

func NewCompositionRepository(db *sql.DB) CompositionRepository {
	return &sqliteCompositionRepo{db: db}
}

const compositionColumns = `id, code, user_id, place, hour, season, stay, ritual, keepsake, created_at, updated_at`

func scanComposition(row interface{ Scan(...interface{}) error }) (*model.Composition, error) {
	var c model.Composition
	p := &c.Picks
	if err := row.Scan(&c.ID, &c.Code, &c.UserID, &p.Place, &p.Hour, &p.Season, &p.Stay, &p.Ritual, &p.Keepsake, &c.CreatedAt, &c.UpdatedAt); err != nil {
		return nil, err
	}
	c.CreatedAt = c.CreatedAt.UTC()
	c.UpdatedAt = c.UpdatedAt.UTC()
	return &c, nil
}

func (r *sqliteCompositionRepo) Upsert(ctx context.Context, c *model.Composition, limit int) (*model.Composition, bool, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()

	now := time.Now().UTC().Truncate(time.Second)
	p := c.Picks
	var owner int64
	err = tx.QueryRowContext(ctx, `SELECT user_id FROM compositions WHERE id = ?`, c.ID).Scan(&owner)
	created := err == sql.ErrNoRows
	switch {
	case err != nil && !created:
		return nil, false, fmt.Errorf("find composition: %w", err)
	case !created && owner != c.UserID:
		return nil, false, ErrCompositionTaken
	case !created:
		if _, err := tx.ExecContext(ctx, `
			UPDATE compositions SET place = ?, hour = ?, season = ?, stay = ?, ritual = ?, keepsake = ?, updated_at = ?
			WHERE id = ? AND user_id = ?`,
			p.Place, p.Hour, p.Season, p.Stay, p.Ritual, p.Keepsake, now, c.ID, c.UserID); err != nil {
			return nil, false, fmt.Errorf("update composition: %w", err)
		}
	default:
		var count int
		if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM compositions WHERE user_id = ?`, c.UserID).Scan(&count); err != nil {
			return nil, false, fmt.Errorf("count compositions: %w", err)
		}
		if limit > 0 && count >= limit {
			return nil, false, ErrCompositionLimit
		}
		createdAt := c.CreatedAt
		if createdAt.IsZero() || createdAt.After(now) {
			createdAt = now
		}
		inserted := false
		for attempt := 0; attempt < 5 && !inserted; attempt++ {
			code, err := newShareCode()
			if err != nil {
				return nil, false, err
			}
			_, err = tx.ExecContext(ctx, `
				INSERT INTO compositions (id, code, user_id, place, hour, season, stay, ritual, keepsake, created_at, updated_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				c.ID, code, c.UserID, p.Place, p.Hour, p.Season, p.Stay, p.Ritual, p.Keepsake, createdAt.UTC(), now)
			if err != nil && !strings.Contains(err.Error(), "compositions.code") {
				return nil, false, fmt.Errorf("insert composition: %w", err)
			}
			inserted = err == nil
		}
		if !inserted {
			return nil, false, errors.New("insert composition: could not find a free share code")
		}
	}

	saved, err := scanComposition(tx.QueryRowContext(ctx, `SELECT `+compositionColumns+` FROM compositions WHERE id = ?`, c.ID))
	if err != nil {
		return nil, false, fmt.Errorf("read composition: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return saved, created, nil
}

func (r *sqliteCompositionRepo) ListByUser(ctx context.Context, userID int64) ([]model.Composition, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+compositionColumns+` FROM compositions WHERE user_id = ? ORDER BY created_at DESC, rowid DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list compositions: %w", err)
	}
	defer rows.Close()
	out := []model.Composition{}
	for rows.Next() {
		c, err := scanComposition(rows)
		if err != nil {
			return nil, fmt.Errorf("scan composition: %w", err)
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

func (r *sqliteCompositionRepo) Delete(ctx context.Context, userID int64, id string) (bool, error) {
	res, err := r.db.ExecContext(ctx, `DELETE FROM compositions WHERE id = ? AND user_id = ?`, id, userID)
	if err != nil {
		return false, fmt.Errorf("delete composition: %w", err)
	}
	n, _ := res.RowsAffected()
	return n > 0, nil
}

func (r *sqliteCompositionRepo) GetByCode(ctx context.Context, code string) (*model.Composition, error) {
	c, err := scanComposition(r.db.QueryRowContext(ctx, `SELECT `+compositionColumns+` FROM compositions WHERE code = ?`, code))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get composition: %w", err)
	}
	return c, nil
}

// Share codes: 12 characters from an alphabet without look-alikes (0/o, 1/l/i), about 59 bits.
const shareAlphabet = "23456789abcdefghjkmnpqrstuvwxyz"

func newShareCode() (string, error) {
	b := make([]byte, 12)
	max := big.NewInt(int64(len(shareAlphabet)))
	for i := range b {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", fmt.Errorf("share code: %w", err)
		}
		b[i] = shareAlphabet[n.Int64()]
	}
	return string(b), nil
}
