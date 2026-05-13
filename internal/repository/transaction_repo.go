package repository

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/100-journeys/app/internal/model"
)

// TransactionRepository defines ledger data access operations.
type TransactionRepository interface {
	ListByUser(ctx context.Context, userID int64) ([]model.Transaction, error)
	ListByOrder(ctx context.Context, orderID int64) ([]model.Transaction, error)
}

type sqliteTransactionRepo struct {
	db *sql.DB
}

func NewTransactionRepository(db *sql.DB) TransactionRepository {
	return &sqliteTransactionRepo{db: db}
}

func (r *sqliteTransactionRepo) ListByUser(ctx context.Context, userID int64) ([]model.Transaction, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, order_id, txn_type, amount, balance_after, description, created_at
		 FROM transactions WHERE user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list transactions: %w", err)
	}
	defer rows.Close()

	var txns []model.Transaction
	for rows.Next() {
		var t model.Transaction
		var orderID sql.NullInt64
		if err := rows.Scan(&t.ID, &t.UserID, &orderID, &t.TxnType, &t.Amount, &t.BalanceAfter, &t.Description, &t.CreatedAt); err != nil {
			return nil, err
		}
		if orderID.Valid {
			oid := orderID.Int64
			t.OrderID = &oid
		}
		txns = append(txns, t)
	}
	return txns, rows.Err()
}

func (r *sqliteTransactionRepo) ListByOrder(ctx context.Context, orderID int64) ([]model.Transaction, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, user_id, order_id, txn_type, amount, balance_after, description, created_at
		 FROM transactions WHERE order_id = ? ORDER BY created_at DESC`, orderID)
	if err != nil {
		return nil, fmt.Errorf("list transactions by order: %w", err)
	}
	defer rows.Close()

	var txns []model.Transaction
	for rows.Next() {
		var t model.Transaction
		var oid sql.NullInt64
		if err := rows.Scan(&t.ID, &t.UserID, &oid, &t.TxnType, &t.Amount, &t.BalanceAfter, &t.Description, &t.CreatedAt); err != nil {
			return nil, err
		}
		if oid.Valid {
			v := oid.Int64
			t.OrderID = &v
		}
		txns = append(txns, t)
	}
	return txns, rows.Err()
}
