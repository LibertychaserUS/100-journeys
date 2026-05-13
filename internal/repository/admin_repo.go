package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/100-journeys/app/internal/model"
)

type AdminRepository interface {
	Stats(ctx context.Context) (*model.AdminStats, error)
	ListUsers(ctx context.Context) ([]model.User, error)
}

type sqliteAdminRepo struct {
	db *sql.DB
}

func NewAdminRepository(db *sql.DB) AdminRepository {
	return &sqliteAdminRepo{db: db}
}

func (r *sqliteAdminRepo) Stats(ctx context.Context) (*model.AdminStats, error) {
	stats := &model.AdminStats{}

	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(points), 0), COALESCE(SUM(balance), 0) FROM users`,
	).Scan(&stats.TotalUsers, &stats.TotalPoints, &stats.TotalBalance); err != nil {
		return nil, fmt.Errorf("admin user aggregates: %w", err)
	}

	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM journeys`).Scan(&stats.TotalJourneys); err != nil {
		return nil, fmt.Errorf("admin journey count: %w", err)
	}

	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0),
		        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_amount ELSE 0 END), 0)
		   FROM orders`,
	).Scan(&stats.TotalOrders, &stats.PaidOrders, &stats.GrossRevenue); err != nil {
		return nil, fmt.Errorf("admin order aggregates: %w", err)
	}

	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM transactions`).Scan(&stats.TotalTransactions); err != nil {
		return nil, fmt.Errorf("admin transaction count: %w", err)
	}
	if err := r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM analytics_events`).Scan(&stats.AnalyticsEvents); err != nil {
		return nil, fmt.Errorf("admin analytics count: %w", err)
	}
	if err := r.db.QueryRowContext(ctx,
		`SELECT COUNT(*), COALESCE(SUM(CASE WHEN level IN ('error', 'panic') THEN 1 ELSE 0 END), 0) FROM audit_logs`,
	).Scan(&stats.AuditLogs, &stats.AuditErrors); err != nil {
		return nil, fmt.Errorf("admin audit aggregates: %w", err)
	}

	var err error
	stats.TopClickedJourneys, err = r.topClickedJourneys(ctx)
	if err != nil {
		return nil, err
	}
	stats.TopPurchasedJourneys, err = r.topPurchasedJourneys(ctx, stats.PaidOrders)
	if err != nil {
		return nil, err
	}
	stats.MBTIDistribution, err = r.mbtiDistribution(ctx, stats.TotalUsers)
	if err != nil {
		return nil, err
	}
	stats.GenderDistribution, err = r.genderDistribution(ctx, stats.TotalUsers)
	if err != nil {
		return nil, err
	}
	stats.PurchaseGenderDistribution, err = r.purchaseGenderDistribution(ctx, stats.PaidOrders)
	if err != nil {
		return nil, err
	}

	return stats, nil
}

func (r *sqliteAdminRepo) ListUsers(ctx context.Context) ([]model.User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, username, email, password_hash, role, level, points, balance, mbti_type, gender, avatar_url, created_at, updated_at
		   FROM users ORDER BY created_at DESC, id DESC`)
	if err != nil {
		return nil, fmt.Errorf("admin list users: %w", err)
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		var mbtiType, gender, avatarURL sql.NullString
		if err := rows.Scan(&u.ID, &u.Username, &u.Email, &u.PasswordHash, &u.Role, &u.Level, &u.Points, &u.Balance, &mbtiType, &gender, &avatarURL, &u.CreatedAt, &u.UpdatedAt); err != nil {
			return nil, err
		}
		u.MBTIType = mbtiType.String
		u.Gender = gender.String
		u.AvatarURL = avatarURL.String
		users = append(users, u)
	}
	return users, rows.Err()
}

func (r *sqliteAdminRepo) topClickedJourneys(ctx context.Context) ([]model.JourneyMetric, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT ae.journey_slug, COALESCE(j.title, ae.journey_slug), COUNT(*) AS click_count
		   FROM analytics_events ae
		   LEFT JOIN journeys j ON j.slug = ae.journey_slug
		  WHERE ae.event_type = 'journey_click' AND ae.journey_slug <> ''
		  GROUP BY ae.journey_slug, j.title
		  ORDER BY click_count DESC, ae.journey_slug ASC
		  LIMIT 8`)
	if err != nil {
		return nil, fmt.Errorf("admin top clicked journeys: %w", err)
	}
	defer rows.Close()

	var metrics []model.JourneyMetric
	for rows.Next() {
		var m model.JourneyMetric
		if err := rows.Scan(&m.Slug, &m.Title, &m.Count); err != nil {
			return nil, err
		}
		metrics = append(metrics, m)
	}
	return metrics, rows.Err()
}

func (r *sqliteAdminRepo) topPurchasedJourneys(ctx context.Context, paidOrders int) ([]model.JourneyMetric, error) {
	rows, err := r.db.QueryContext(ctx,
		`WITH purchases AS (
			SELECT oi.journey_id, COALESCE(j.slug, '') AS slug, oi.journey_title,
			       COUNT(*) AS purchase_count, COALESCE(SUM(oi.subtotal), 0) AS revenue
			  FROM order_items oi
			  JOIN orders o ON o.id = oi.order_id
			  LEFT JOIN journeys j ON j.id = oi.journey_id
			 WHERE o.status = 'paid'
			 GROUP BY oi.journey_id, j.slug, oi.journey_title
		),
		clicks AS (
			SELECT journey_slug, COUNT(*) AS click_count
			  FROM analytics_events
			 WHERE event_type = 'journey_click' AND journey_slug <> ''
			 GROUP BY journey_slug
		)
		SELECT p.slug, p.journey_title, p.purchase_count, p.revenue, COALESCE(c.click_count, 0)
		  FROM purchases p
		  LEFT JOIN clicks c ON c.journey_slug = p.slug
		 ORDER BY p.purchase_count DESC, p.revenue DESC
		 LIMIT 8`)
	if err != nil {
		return nil, fmt.Errorf("admin top purchased journeys: %w", err)
	}
	defer rows.Close()

	var metrics []model.JourneyMetric
	for rows.Next() {
		var m model.JourneyMetric
		var clicks int
		if err := rows.Scan(&m.Slug, &m.Title, &m.Count, &m.Revenue, &clicks); err != nil {
			return nil, err
		}
		if clicks > 0 {
			m.Rate = float64(m.Count) / float64(clicks)
		} else if paidOrders > 0 {
			m.Rate = float64(m.Count) / float64(paidOrders)
		}
		metrics = append(metrics, m)
	}
	return metrics, rows.Err()
}

func (r *sqliteAdminRepo) mbtiDistribution(ctx context.Context, totalUsers int) ([]model.DistributionItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT COALESCE(NULLIF(mbti_type, ''), 'unknown') AS label, COUNT(*) AS count
		   FROM users
		  GROUP BY label
		  ORDER BY count DESC, label ASC`)
	if err != nil {
		return nil, fmt.Errorf("admin mbti distribution: %w", err)
	}
	defer rows.Close()

	return scanDistribution(rows, totalUsers)
}

func (r *sqliteAdminRepo) genderDistribution(ctx context.Context, totalUsers int) ([]model.DistributionItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT COALESCE(NULLIF(gender, ''), 'prefer_not_to_say') AS label, COUNT(*) AS count
		   FROM users
		  GROUP BY label
		  ORDER BY count DESC, label ASC`)
	if err != nil {
		return nil, fmt.Errorf("admin gender distribution: %w", err)
	}
	defer rows.Close()

	return scanDistribution(rows, totalUsers)
}

func (r *sqliteAdminRepo) purchaseGenderDistribution(ctx context.Context, paidOrders int) ([]model.DistributionItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT COALESCE(NULLIF(u.gender, ''), 'prefer_not_to_say') AS label, COUNT(*) AS count
		   FROM orders o
		   JOIN users u ON u.id = o.user_id
		  WHERE o.status = 'paid'
		  GROUP BY label
		  ORDER BY count DESC, label ASC`)
	if err != nil {
		return nil, fmt.Errorf("admin purchase gender distribution: %w", err)
	}
	defer rows.Close()

	return scanDistribution(rows, paidOrders)
}

func scanDistribution(rows *sql.Rows, total int) ([]model.DistributionItem, error) {
	var items []model.DistributionItem
	for rows.Next() {
		var item model.DistributionItem
		if err := rows.Scan(&item.Label, &item.Count); err != nil {
			return nil, err
		}
		if total > 0 {
			item.Percent = float64(item.Count) / float64(total)
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
