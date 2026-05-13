package repository

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupOrderRepo(t *testing.T) (OrderRepository, UserRepository, *sql.DB) {
	t.Helper()
	projectRoot, _ := filepath.Abs("../..")
	db, err := NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))
	return NewOrderRepository(db), NewUserRepository(db), db
}

func seedUserAndJourney(t *testing.T, db *sql.DB, userID, journeyID *int64) {
	t.Helper()
	ctx := context.Background()
	res, err := db.ExecContext(ctx, "INSERT INTO users (username, email, password_hash, role, level, points, balance) VALUES (?, ?, ?, ?, ?, ?, ?)",
		"testuser", "test@example.com", "hash", model.RoleUser, 1, 5000, 10000)
	require.NoError(t, err)
	*userID, _ = res.LastInsertId()

	res2, err := db.ExecContext(ctx, "INSERT INTO journeys (title, slug, price) VALUES (?, ?, ?)",
		"Test Journey", "test-journey", 2999)
	require.NoError(t, err)
	*journeyID, _ = res2.LastInsertId()
}

// UT-ORDER-001: Create order with items
func TestOrderRepo_Create(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	items := []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "Test Journey", UnitPrice: 2999, Quantity: 1},
	}
	order, err := repo.Create(ctx, userID, items)
	require.NoError(t, err)
	require.NotNil(t, order)
	assert.Greater(t, order.ID, int64(0))
	assert.Equal(t, model.OrderStatusPending, order.Status)
	assert.Equal(t, 2999, order.TotalAmount)
	assert.Len(t, order.Items, 1)
	assert.Equal(t, 2999, order.Items[0].Subtotal)
	assert.NotEmpty(t, order.OrderNo)
}

// UT-ORDER-002: Get order by ID
func TestOrderRepo_GetByID(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	items := []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "Test Journey", UnitPrice: 2999, Quantity: 2},
	}
	created, err := repo.Create(ctx, userID, items)
	require.NoError(t, err)

	found, err := repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	require.NotNil(t, found)
	assert.Equal(t, created.OrderNo, found.OrderNo)
	assert.Equal(t, 5998, found.TotalAmount)
	assert.Len(t, found.Items, 1)
}

// UT-ORDER-003: Get order by ID not found
func TestOrderRepo_GetByID_NotFound(t *testing.T) {
	repo, _, _ := setupOrderRepo(t)
	ctx := context.Background()

	found, err := repo.GetByID(ctx, 99999)
	require.NoError(t, err)
	assert.Nil(t, found)
}

// UT-ORDER-004: List orders by user
func TestOrderRepo_ListByUser(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	_, err := repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 1000, Quantity: 1},
	})
	require.NoError(t, err)
	_, err = repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 2000, Quantity: 1},
	})
	require.NoError(t, err)

	orders, err := repo.ListByUser(ctx, userID)
	require.NoError(t, err)
	assert.Len(t, orders, 2)
	totals := map[int]bool{}
	for _, o := range orders {
		totals[o.TotalAmount] = true
	}
	assert.True(t, totals[1000])
	assert.True(t, totals[2000])
}

// UT-ORDER-005: Pay order successfully (atomic transaction)
func TestOrderRepo_Pay_Success(t *testing.T) {
	repo, userRepo, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	order, err := repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 1000, Quantity: 1},
	})
	require.NoError(t, err)

	err = repo.Pay(ctx, order.ID, userID)
	require.NoError(t, err)

	// Verify order paid
	paidOrder, err := repo.GetByID(ctx, order.ID)
	require.NoError(t, err)
	assert.Equal(t, model.OrderStatusPaid, paidOrder.Status)
	assert.NotNil(t, paidOrder.PaidAt)

	// Verify balance deducted
	user, err := userRepo.GetByID(ctx, userID)
	require.NoError(t, err)
	assert.Equal(t, 9000, user.Balance)

	// Verify transaction recorded
	txnRepo := NewTransactionRepository(db)
	txns, err := txnRepo.ListByOrder(ctx, order.ID)
	require.NoError(t, err)
	require.Len(t, txns, 1)
	assert.Equal(t, model.TxnTypePurchase, txns[0].TxnType)
	assert.Equal(t, -1000, txns[0].Amount)
	assert.Equal(t, 9000, txns[0].BalanceAfter)
}

// UT-ORDER-006: Pay order with insufficient balance
func TestOrderRepo_Pay_InsufficientBalance(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	// Reduce balance to 500
	_, err := db.ExecContext(ctx, "UPDATE users SET balance = ? WHERE id = ?", 500, userID)
	require.NoError(t, err)

	order, err := repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 1000, Quantity: 1},
	})
	require.NoError(t, err)

	err = repo.Pay(ctx, order.ID, userID)
	require.Error(t, err)
	assert.Equal(t, "insufficient balance", err.Error())

	// Order should still be pending
	o, _ := repo.GetByID(ctx, order.ID)
	assert.Equal(t, model.OrderStatusPending, o.Status)
}

// UT-ORDER-007: Pay order already paid
func TestOrderRepo_Pay_AlreadyPaid(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	order, err := repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 1000, Quantity: 1},
	})
	require.NoError(t, err)
	require.NoError(t, repo.Pay(ctx, order.ID, userID))

	err = repo.Pay(ctx, order.ID, userID)
	require.Error(t, err)
	assert.Equal(t, "order is not pending", err.Error())
}

// UT-ORDER-008: Pay order not owned by user
func TestOrderRepo_Pay_WrongUser(t *testing.T) {
	repo, _, db := setupOrderRepo(t)
	ctx := context.Background()
	var userID, journeyID int64
	seedUserAndJourney(t, db, &userID, &journeyID)

	// Create second user
	res, err := db.ExecContext(ctx, "INSERT INTO users (username, email, password_hash, role, level, points, balance) VALUES (?, ?, ?, ?, ?, ?, ?)",
		"other", "other@example.com", "hash", model.RoleUser, 1, 0, 10000)
	require.NoError(t, err)
	otherUserID, _ := res.LastInsertId()

	order, err := repo.Create(ctx, userID, []model.OrderItem{
		{JourneyID: journeyID, JourneyTitle: "J1", UnitPrice: 1000, Quantity: 1},
	})
	require.NoError(t, err)

	err = repo.Pay(ctx, order.ID, otherUserID)
	require.Error(t, err)
	assert.Equal(t, "order not found", err.Error())
}
