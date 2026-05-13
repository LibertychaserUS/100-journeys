package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/100-journeys/app/internal/model"
)

// UserRepository defines user data access operations.
type UserRepository interface {
	Create(ctx context.Context, user *model.User) error
	GetByEmail(ctx context.Context, email string) (*model.User, error)
	GetByID(ctx context.Context, id int64) (*model.User, error)
	AddPoints(ctx context.Context, userID int64, delta int, actionType, description string) error
	SaveJourney(ctx context.Context, userID, journeyID int64) error
	UnsaveJourney(ctx context.Context, userID, journeyID int64) error
	ListSavedJourneys(ctx context.Context, userID int64) ([]int64, error)
	ListPointsHistory(ctx context.Context, userID int64) ([]model.PointsHistory, error)
}

type sqliteUserRepo struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &sqliteUserRepo{db: db}
}

func (r *sqliteUserRepo) Create(ctx context.Context, user *model.User) error {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO users (username, email, password_hash, role, level, points, mbti_type, avatar_url)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		user.Username, user.Email, user.PasswordHash, user.Role, user.Level, user.Points, user.MBTIType, user.AvatarURL)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	id, _ := res.LastInsertId()
	user.ID = id
	return nil
}

func (r *sqliteUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, level, points, mbti_type, avatar_url, created_at, updated_at
		 FROM users WHERE email = ?`, email).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.Level, &u.Points,
		&u.MBTIType, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	return &u, nil
}

func (r *sqliteUserRepo) GetByID(ctx context.Context, id int64) (*model.User, error) {
	var u model.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, level, points, mbti_type, avatar_url, created_at, updated_at
		 FROM users WHERE id = ?`, id).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.Level, &u.Points,
		&u.MBTIType, &u.AvatarURL, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *sqliteUserRepo) AddPoints(ctx context.Context, userID int64, delta int, actionType, description string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current int
	if err := tx.QueryRowContext(ctx, `SELECT points FROM users WHERE id = ?`, userID).Scan(&current); err != nil {
		return fmt.Errorf("get current points: %w", err)
	}

	newBalance := current + delta
	if _, err := tx.ExecContext(ctx, `UPDATE users SET points = ? WHERE id = ?`, newBalance, userID); err != nil {
		return fmt.Errorf("update points: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO user_points_history (user_id, action_type, points_delta, balance_after, description)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, actionType, delta, newBalance, description); err != nil {
		return fmt.Errorf("insert points history: %w", err)
	}

	return tx.Commit()
}

func (r *sqliteUserRepo) SaveJourney(ctx context.Context, userID, journeyID int64) error {
	_, err := r.db.ExecContext(ctx,
		`INSERT OR IGNORE INTO user_saved_journeys (user_id, journey_id) VALUES (?, ?)`,
		userID, journeyID)
	if err != nil {
		return fmt.Errorf("save journey: %w", err)
	}
	return nil
}

func (r *sqliteUserRepo) UnsaveJourney(ctx context.Context, userID, journeyID int64) error {
	_, err := r.db.ExecContext(ctx,
		`DELETE FROM user_saved_journeys WHERE user_id = ? AND journey_id = ?`,
		userID, journeyID)
	if err != nil {
		return fmt.Errorf("unsave journey: %w", err)
	}
	return nil
}

func (r *sqliteUserRepo) ListSavedJourneys(ctx context.Context, userID int64) ([]int64, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT journey_id FROM user_saved_journeys WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list saved journeys: %w", err)
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

func (r *sqliteUserRepo) ListPointsHistory(ctx context.Context, userID int64) ([]model.PointsHistory, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, action_type, points_delta, balance_after, description, created_at
		 FROM user_points_history WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list points history: %w", err)
	}
	defer rows.Close()

	var history []model.PointsHistory
	for rows.Next() {
		var h model.PointsHistory
		if err := rows.Scan(&h.ID, &h.UserID, &h.ActionType, &h.PointsDelta, &h.BalanceAfter, &h.Description, &h.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, h)
	}
	return history, rows.Err()
}
