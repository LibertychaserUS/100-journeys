package model

import "time"

// Transaction type constants.
const (
	TxnTypeRecharge = "recharge"
	TxnTypePurchase = "purchase"
	TxnTypeRefund   = "refund"
	TxnTypeBonus    = "bonus"
)

// Transaction represents a single entry in the balance ledger.
type Transaction struct {
	ID            int64     `json:"id"`
	UserID        int64     `json:"user_id"`
	OrderID       *int64    `json:"order_id,omitempty"`
	TxnType       string    `json:"txn_type"`
	Amount        int       `json:"amount"`          // positive = credit, negative = debit
	BalanceAfter  int       `json:"balance_after"`
	Description   string    `json:"description,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
}
