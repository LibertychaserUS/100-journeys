package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/100-journeys/app/internal/model"
)

// OrderRepository defines order data access operations.
type OrderRepository interface {
	Create(ctx context.Context, userID int64, items []model.OrderItem) (*model.Order, error)
	GetByID(ctx context.Context, id int64) (*model.Order, error)
	GetByNo(ctx context.Context, orderNo string) (*model.Order, error)
	ListByUser(ctx context.Context, userID int64) ([]model.Order, error)
	UpdateStatus(ctx context.Context, id int64, status string) error
	MarkPaid(ctx context.Context, id int64) error
	Pay(ctx context.Context, orderID, userID int64) error
}

type sqliteOrderRepo struct {
	db *sql.DB
}

func NewOrderRepository(db *sql.DB) OrderRepository {
	return &sqliteOrderRepo{db: db}
}

// generateOrderNo creates a unique order number: JNY + yymmdd + 6-digit random.
func generateOrderNo() string {
	now := time.Now()
	return fmt.Sprintf("JNY%s%06d", now.Format("060102150405"), now.Nanosecond()%1000000)
}

func (r *sqliteOrderRepo) Create(ctx context.Context, userID int64, items []model.OrderItem) (*model.Order, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// Compute total
	total := 0
	for i := range items {
		items[i].Subtotal = items[i].UnitPrice * items[i].Quantity
		total += items[i].Subtotal
	}

	orderNo := generateOrderNo()
	res, err := tx.ExecContext(ctx,
		`INSERT INTO orders (order_no, user_id, status, total_amount, currency)
		 VALUES (?, ?, ?, ?, ?)`,
		orderNo, userID, model.OrderStatusPending, total, "WONDER")
	if err != nil {
		return nil, fmt.Errorf("insert order: %w", err)
	}
	orderID, _ := res.LastInsertId()

	for _, item := range items {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO order_items (order_id, journey_id, journey_title, unit_price, quantity, subtotal)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			orderID, item.JourneyID, item.JourneyTitle, item.UnitPrice, item.Quantity, item.Subtotal); err != nil {
			return nil, fmt.Errorf("insert order item: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	return r.GetByID(ctx, orderID)
}

func (r *sqliteOrderRepo) GetByID(ctx context.Context, id int64) (*model.Order, error) {
	var o model.Order
	var paidAt sql.NullTime
	err := r.db.QueryRowContext(ctx,
		`SELECT id, order_no, user_id, status, total_amount, currency, paid_at, created_at, updated_at
		 FROM orders WHERE id = ?`, id).Scan(
		&o.ID, &o.OrderNo, &o.UserID, &o.Status, &o.TotalAmount, &o.Currency, &paidAt, &o.CreatedAt, &o.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get order by id: %w", err)
	}
	if paidAt.Valid {
		o.PaidAt = &paidAt.Time
	}
	items, err := r.listItems(ctx, id)
	if err != nil {
		return nil, err
	}
	o.Items = items
	return &o, nil
}

func (r *sqliteOrderRepo) GetByNo(ctx context.Context, orderNo string) (*model.Order, error) {
	var id int64
	if err := r.db.QueryRowContext(ctx, `SELECT id FROM orders WHERE order_no = ?`, orderNo).Scan(&id); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("get order by no: %w", err)
	}
	return r.GetByID(ctx, id)
}

func (r *sqliteOrderRepo) ListByUser(ctx context.Context, userID int64) ([]model.Order, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, order_no, user_id, status, total_amount, currency, paid_at, created_at, updated_at
		 FROM orders WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	defer rows.Close()

	var orders []model.Order
	for rows.Next() {
		var o model.Order
		var paidAt sql.NullTime
		if err := rows.Scan(&o.ID, &o.OrderNo, &o.UserID, &o.Status, &o.TotalAmount, &o.Currency, &paidAt, &o.CreatedAt, &o.UpdatedAt); err != nil {
			return nil, err
		}
		if paidAt.Valid {
			o.PaidAt = &paidAt.Time
		}
		orders = append(orders, o)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()

	for i := range orders {
		items, err := r.listItems(ctx, orders[i].ID)
		if err != nil {
			return nil, err
		}
		orders[i].Items = items
	}
	return orders, nil
}

func (r *sqliteOrderRepo) UpdateStatus(ctx context.Context, id int64, status string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE orders SET status = ? WHERE id = ?`, status, id)
	if err != nil {
		return fmt.Errorf("update order status: %w", err)
	}
	return nil
}

func (r *sqliteOrderRepo) MarkPaid(ctx context.Context, id int64) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE orders SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
		model.OrderStatusPaid, id)
	if err != nil {
		return fmt.Errorf("mark order paid: %w", err)
	}
	return nil
}

func (r *sqliteOrderRepo) Pay(ctx context.Context, orderID, userID int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Verify order ownership and status
	var total int
	var status string
	var oid int64
	if err := tx.QueryRowContext(ctx,
		`SELECT id, status, total_amount FROM orders WHERE id = ? AND user_id = ?`,
		orderID, userID).Scan(&oid, &status, &total); err != nil {
		if err == sql.ErrNoRows {
			return fmt.Errorf("order not found")
		}
		return fmt.Errorf("get order: %w", err)
	}
	if status != model.OrderStatusPending {
		return fmt.Errorf("order is not pending")
	}

	// Check balance
	var balance int
	if err := tx.QueryRowContext(ctx, `SELECT balance FROM users WHERE id = ?`, userID).Scan(&balance); err != nil {
		return fmt.Errorf("get balance: %w", err)
	}
	if balance < total {
		return fmt.Errorf("insufficient balance")
	}

	// Deduct balance
	newBalance := balance - total
	if _, err := tx.ExecContext(ctx, `UPDATE users SET balance = ? WHERE id = ?`, newBalance, userID); err != nil {
		return fmt.Errorf("deduct balance: %w", err)
	}

	// Record transaction
	if _, err := tx.ExecContext(ctx,
		`INSERT INTO transactions (user_id, order_id, txn_type, amount, balance_after, description)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		userID, orderID, model.TxnTypePurchase, -total, newBalance, fmt.Sprintf("支付订单 %d", orderID)); err != nil {
		return fmt.Errorf("insert transaction: %w", err)
	}

	// Mark order paid
	if _, err := tx.ExecContext(ctx,
		`UPDATE orders SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE id = ?`,
		model.OrderStatusPaid, orderID); err != nil {
		return fmt.Errorf("mark paid: %w", err)
	}

	return tx.Commit()
}

func (r *sqliteOrderRepo) listItems(ctx context.Context, orderID int64) ([]model.OrderItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, order_id, journey_id, journey_title, unit_price, quantity, subtotal
		 FROM order_items WHERE order_id = ?`, orderID)
	if err != nil {
		return nil, fmt.Errorf("list order items: %w", err)
	}
	defer rows.Close()

	var items []model.OrderItem
	for rows.Next() {
		var item model.OrderItem
		if err := rows.Scan(&item.ID, &item.OrderID, &item.JourneyID, &item.JourneyTitle,
			&item.UnitPrice, &item.Quantity, &item.Subtotal); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
