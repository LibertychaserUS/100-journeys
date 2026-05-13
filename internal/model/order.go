package model

import "time"

// Order status constants.
const (
	OrderStatusPending   = "pending"
	OrderStatusPaid      = "paid"
	OrderStatusCancelled = "cancelled"
	OrderStatusRefunded  = "refunded"
)

// Order represents a purchase order.
type Order struct {
	ID          int64       `json:"id"`
	OrderNo     string      `json:"order_no"`
	UserID      int64       `json:"user_id"`
	Status      string      `json:"status"`
	TotalAmount int         `json:"total_amount"`
	Currency    string      `json:"currency"`
	PaidAt      *time.Time  `json:"paid_at,omitempty"`
	Items       []OrderItem `json:"items,omitempty"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// OrderItem represents a line item in an order.
type OrderItem struct {
	ID           int64  `json:"id"`
	OrderID      int64  `json:"order_id"`
	JourneyID    int64  `json:"journey_id"`
	JourneyTitle string `json:"journey_title"`
	UnitPrice    int    `json:"unit_price"`
	Quantity     int    `json:"quantity"`
	Subtotal     int    `json:"subtotal"`
}

// CreateOrderRequest is the payload to create an order.
type CreateOrderRequest struct {
	Items []CreateOrderItemRequest `json:"items" binding:"required,min=1,dive"`
}

// CreateOrderItemRequest is a single item in a create-order payload.
type CreateOrderItemRequest struct {
	JourneySlug string `json:"journey_slug" binding:"required"`
	Quantity    int    `json:"quantity" binding:"required,min=1"`
}

// RechargeRequest is the payload for virtual currency top-up.
type RechargeRequest struct {
	Amount int `json:"amount" binding:"required,min=1,max=100000"`
}
