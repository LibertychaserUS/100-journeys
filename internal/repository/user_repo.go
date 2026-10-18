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
	// AddPointsOncePerDay awards points only if the user has no entry of actionType for the current UTC day.
	AddPointsOncePerDay(ctx context.Context, userID int64, delta int, actionType, description string) (bool, error)
	UpdateMBTI(ctx context.Context, userID int64, mbtiType string) error
	SaveJourney(ctx context.Context, userID, journeyID int64) error
	UnsaveJourney(ctx context.Context, userID, journeyID int64) error
	ListSavedJourneys(ctx context.Context, userID int64) ([]int64, error)
	// SetChoice records the option picked at a journey's fork (last pick wins).
	SetChoice(ctx context.Context, userID, journeyID int64, optionKey string) error
	// ListChoices returns the user's fork picks keyed by journey slug.
	ListChoices(ctx context.Context, userID int64) (map[string]string, error)
	ListPointsHistory(ctx context.Context, userID int64) ([]model.PointsHistory, error)
	UpdateAvatar(ctx context.Context, userID int64, avatarURL string) error
	GetBalance(ctx context.Context, userID int64) (int, error)
	Recharge(ctx context.Context, userID int64, amount int, description string) error
	// RechargeWithBonus credits amount and bonus atomically, writing one ledger row for each.
	RechargeWithBonus(ctx context.Context, userID int64, amount, bonus int, description, bonusDescription string) (int, error)
	Deduct(ctx context.Context, userID int64, amount int, orderID int64, description string) error
}

type sqliteUserRepo struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) UserRepository {
	return &sqliteUserRepo{db: db}
}

func (r *sqliteUserRepo) Create(ctx context.Context, user *model.User) error {
	return retryBusy(ctx, func() error {
		res, err := r.db.ExecContext(ctx,
			`INSERT INTO users (username, email, password_hash, role, level, points, balance, mbti_type, gender, avatar_url, age_band)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			user.Username, user.Email, user.PasswordHash, user.Role, user.Level, user.Points, user.Balance, user.MBTIType, normalizedGender(user.Gender), user.AvatarURL, user.AgeBand)
		if err != nil {
			return fmt.Errorf("create user: %w", err)
		}
		id, _ := res.LastInsertId()
		user.ID = id
		return nil
	})
}

func (r *sqliteUserRepo) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	var u model.User
	var mbtiType, gender, avatarURL sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, level, points, balance, mbti_type, gender, avatar_url, age_band, created_at, updated_at
		 FROM users WHERE email = ?`, email).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.Level, &u.Points, &u.Balance,
		&mbtiType, &gender, &avatarURL, &u.AgeBand, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}
	u.MBTIType = mbtiType.String
	u.Gender = normalizedGender(gender.String)
	u.AvatarURL = avatarURL.String
	return &u, nil
}

func (r *sqliteUserRepo) GetByID(ctx context.Context, id int64) (*model.User, error) {
	var u model.User
	var mbtiType, gender, avatarURL sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT id, username, email, password_hash, role, level, points, balance, mbti_type, gender, avatar_url, age_band, created_at, updated_at
		 FROM users WHERE id = ?`, id).Scan(
		&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.Level, &u.Points, &u.Balance,
		&mbtiType, &gender, &avatarURL, &u.AgeBand, &u.CreatedAt, &u.UpdatedAt)
	u.MBTIType = mbtiType.String
	u.Gender = normalizedGender(gender.String)
	u.AvatarURL = avatarURL.String
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get user by id: %w", err)
	}
	return &u, nil
}

func (r *sqliteUserRepo) AddPoints(ctx context.Context, userID int64, delta int, actionType, description string) error {
	return retryBusy(ctx, func() error {
		return r.addPointsOnce(ctx, userID, delta, actionType, description)
	})
}

func (r *sqliteUserRepo) addPointsOnce(ctx context.Context, userID int64, delta int, actionType, description string) error {
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
	return retryBusy(ctx, func() error {
		_, err := r.db.ExecContext(ctx,
			`INSERT OR IGNORE INTO user_saved_journeys (user_id, journey_id) VALUES (?, ?)`,
			userID, journeyID)
		if err != nil {
			return fmt.Errorf("save journey: %w", err)
		}
		return nil
	})
}

func (r *sqliteUserRepo) UnsaveJourney(ctx context.Context, userID, journeyID int64) error {
	return retryBusy(ctx, func() error {
		_, err := r.db.ExecContext(ctx,
			`DELETE FROM user_saved_journeys WHERE user_id = ? AND journey_id = ?`,
			userID, journeyID)
		if err != nil {
			return fmt.Errorf("unsave journey: %w", err)
		}
		return nil
	})
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

func (r *sqliteUserRepo) SetChoice(ctx context.Context, userID, journeyID int64, optionKey string) error {
	return retryBusy(ctx, func() error {
		_, err := r.db.ExecContext(ctx, `
			INSERT INTO journey_choices (user_id, journey_id, option_key) VALUES (?, ?, ?)
			ON CONFLICT(user_id, journey_id) DO UPDATE SET option_key = excluded.option_key, updated_at = CURRENT_TIMESTAMP`,
			userID, journeyID, optionKey)
		if err != nil {
			return fmt.Errorf("set choice: %w", err)
		}
		return nil
	})
}

func (r *sqliteUserRepo) ListChoices(ctx context.Context, userID int64) (map[string]string, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT j.slug, c.option_key FROM journey_choices c JOIN journeys j ON j.id = c.journey_id
		WHERE c.user_id = ?`, userID)
	if err != nil {
		return nil, fmt.Errorf("list choices: %w", err)
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var slug, key string
		if err := rows.Scan(&slug, &key); err != nil {
			return nil, err
		}
		out[slug] = key
	}
	return out, rows.Err()
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

func (r *sqliteUserRepo) UpdateAvatar(ctx context.Context, userID int64, avatarURL string) error {
	return retryBusy(ctx, func() error {
		if _, err := r.db.ExecContext(ctx, `UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, avatarURL, userID); err != nil {
			return fmt.Errorf("update avatar: %w", err)
		}
		return nil
	})
}

func (r *sqliteUserRepo) GetBalance(ctx context.Context, userID int64) (int, error) {
	var balance int
	if err := r.db.QueryRowContext(ctx, `SELECT balance FROM users WHERE id = ?`, userID).Scan(&balance); err != nil {
		return 0, fmt.Errorf("get balance: %w", err)
	}
	return balance, nil
}

func (r *sqliteUserRepo) Recharge(ctx context.Context, userID int64, amount int, description string) error {
	return retryBusy(ctx, func() error {
		return r.rechargeOnce(ctx, userID, amount, description)
	})
}

func (r *sqliteUserRepo) rechargeOnce(ctx context.Context, userID int64, amount int, description string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current int
	if err := tx.QueryRowContext(ctx, `SELECT balance FROM users WHERE id = ?`, userID).Scan(&current); err != nil {
		return fmt.Errorf("get current balance: %w", err)
	}

	newBalance := current + amount
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance = ? WHERE id = ?`, newBalance, userID); err != nil {
		return fmt.Errorf("update balance: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO transactions (user_id, txn_type, amount, balance_after, description)
		 VALUES (?, ?, ?, ?, ?)`,
		userID, model.TxnTypeRecharge, amount, newBalance, description); err != nil {
		return fmt.Errorf("insert transaction: %w", err)
	}

	return tx.Commit()
}

func (r *sqliteUserRepo) Deduct(ctx context.Context, userID int64, amount int, orderID int64, description string) error {
	return retryBusy(ctx, func() error {
		return r.deductOnce(ctx, userID, amount, orderID, description)
	})
}

func (r *sqliteUserRepo) deductOnce(ctx context.Context, userID int64, amount int, orderID int64, description string) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var current int
	if err := tx.QueryRowContext(ctx, `SELECT balance FROM users WHERE id = ?`, userID).Scan(&current); err != nil {
		return fmt.Errorf("get current balance: %w", err)
	}

	if current < amount {
		return fmt.Errorf("insufficient balance")
	}

	newBalance := current - amount
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance = ? WHERE id = ?`, newBalance, userID); err != nil {
		return fmt.Errorf("update balance: %w", err)
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO transactions (user_id, order_id, txn_type, amount, balance_after, description)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		userID, orderID, model.TxnTypePurchase, -amount, newBalance, description); err != nil {
		return fmt.Errorf("insert transaction: %w", err)
	}

	return tx.Commit()
}

func normalizedGender(gender string) string {
	switch gender {
	case "female", "male", "non_binary", "prefer_not_to_say":
		return gender
	default:
		return "prefer_not_to_say"
	}
}

func (r *sqliteUserRepo) AddPointsOncePerDay(ctx context.Context, userID int64, delta int, actionType, description string) (bool, error) {
	awarded := false
	err := retryBusy(ctx, func() error {
		awarded = false
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()

		var already int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM user_points_history
			  WHERE user_id = ? AND action_type = ? AND date(created_at) = date('now')`,
			userID, actionType).Scan(&already); err != nil {
			return fmt.Errorf("check daily points: %w", err)
		}
		if already > 0 {
			return nil
		}

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
		if err := tx.Commit(); err != nil {
			return err
		}
		awarded = true
		return nil
	})
	return awarded, err
}

func (r *sqliteUserRepo) UpdateMBTI(ctx context.Context, userID int64, mbtiType string) error {
	return retryBusy(ctx, func() error {
		if _, err := r.db.ExecContext(ctx,
			`UPDATE users SET mbti_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, mbtiType, userID); err != nil {
			return fmt.Errorf("update mbti: %w", err)
		}
		return nil
	})
}

func (r *sqliteUserRepo) RechargeWithBonus(ctx context.Context, userID int64, amount, bonus int, description, bonusDescription string) (int, error) {
	var balance int
	err := retryBusy(ctx, func() error {
		tx, err := r.db.BeginTx(ctx, nil)
		if err != nil {
			return err
		}
		defer tx.Rollback()

		var current int
		if err := tx.QueryRowContext(ctx, `SELECT balance FROM users WHERE id = ?`, userID).Scan(&current); err != nil {
			return fmt.Errorf("get current balance: %w", err)
		}
		afterRecharge := current + amount
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO transactions (user_id, txn_type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)`,
			userID, model.TxnTypeRecharge, amount, afterRecharge, description); err != nil {
			return fmt.Errorf("insert recharge transaction: %w", err)
		}
		final := afterRecharge
		if bonus > 0 {
			final += bonus
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO transactions (user_id, txn_type, amount, balance_after, description) VALUES (?, ?, ?, ?, ?)`,
				userID, model.TxnTypeBonus, bonus, final, bonusDescription); err != nil {
				return fmt.Errorf("insert bonus transaction: %w", err)
			}
		}
		if _, err := tx.ExecContext(ctx, `UPDATE users SET balance = ? WHERE id = ?`, final, userID); err != nil {
			return fmt.Errorf("update balance: %w", err)
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		balance = final
		return nil
	})
	return balance, err
}
