package handler

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupOrderPaymentTestRouter(t *testing.T) (*gin.Engine, *sql.DB, repository.UserRepository, *service.CaptchaStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	userRepo := repository.NewUserRepository(db)
	journeyRepo := repository.NewJourneyRepository(db)
	orderRepo := repository.NewOrderRepository(db)
	txnRepo := repository.NewTransactionRepository(db)
	captchaStore := service.NewCaptchaStore()

	orderH := NewOrderHandler(orderRepo, journeyRepo, userRepo)
	paymentH := NewPaymentHandler(userRepo, txnRepo)
	authH := NewAuthHandler(userRepo, captchaStore)

	r := gin.New()
	api := r.Group("/api")
	OrderRoutes(api, orderH)
	PaymentRoutes(api, paymentH)
	api.POST("/auth/register", authH.Register)
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	{
		auth.GET("/me", authH.Me)
	}

	return r, db, userRepo, captchaStore
}

func registerAndGetToken(t *testing.T, r *gin.Engine, captchaStore *service.CaptchaStore) string {
	cid, _, ans := captchaStore.Generate()
	body, _ := json.Marshal(model.RegisterRequest{Username: "testuser", Email: "test@example.com", Password: "password123", CaptchaID: cid, CaptchaAnswer: ans})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	return res["data"].(map[string]interface{})["token"].(string)
}

func seedJourney(t *testing.T, db *sql.DB) int64 {
	res, err := db.Exec("INSERT INTO journeys (title, slug, price) VALUES (?, ?, ?)", "Test Journey", "test-journey", 2999)
	require.NoError(t, err)
	id, _ := res.LastInsertId()
	return id
}

// UT-HANDLER-PAYMENT-001: Recharge success
func TestPaymentHandler_Recharge_Success(t *testing.T) {
	r, _, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)

	body, _ := json.Marshal(model.RechargeRequest{Amount: 5000})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/payments/recharge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	assert.Equal(t, float64(5000), res["data"].(map[string]interface{})["recharged"])
}

// UT-HANDLER-PAYMENT-002: Recharge unauthorized
func TestPaymentHandler_Recharge_Unauthorized(t *testing.T) {
	r, _, _, _ := setupOrderPaymentTestRouter(t)

	body, _ := json.Marshal(model.RechargeRequest{Amount: 5000})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/payments/recharge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// UT-HANDLER-PAYMENT-003: List transactions after recharge
func TestPaymentHandler_Transactions_AfterRecharge(t *testing.T) {
	r, _, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)

	// Recharge
	body, _ := json.Marshal(model.RechargeRequest{Amount: 3000})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/payments/recharge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// List transactions
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("GET", "/api/payments/transactions", nil)
	req2.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w2, req2)

	require.Equal(t, http.StatusOK, w2.Code)
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &res))
	data := res["data"].([]interface{})
	assert.Len(t, data, 1)
	assert.Equal(t, float64(3000), data[0].(map[string]interface{})["amount"])
}

// UT-HANDLER-ORDER-001: Create order success
func TestOrderHandler_Create_Success(t *testing.T) {
	r, db, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)
	seedJourney(t, db)

	body, _ := json.Marshal(model.CreateOrderRequest{
		Items: []model.CreateOrderItemRequest{{JourneySlug: "test-journey", Quantity: 2}},
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/orders", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	data := res["data"].(map[string]interface{})
	assert.NotEmpty(t, data["order_no"])
	// 2999 * 0.98 discount * 2 qty = 5878
	assert.Equal(t, float64(5878), data["total_amount"])
}

// UT-HANDLER-ORDER-002: Create order with discount (5000 points = Lv2 = 2% off)
func TestOrderHandler_Create_WithDiscount(t *testing.T) {
	r, db, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)
	seedJourney(t, db)

	body, _ := json.Marshal(model.CreateOrderRequest{
		Items: []model.CreateOrderItemRequest{{JourneySlug: "test-journey", Quantity: 1}},
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/orders", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code)
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	data := res["data"].(map[string]interface{})
	// 2999 * 0.98 = 2939.02 → integer math = 2939
	assert.Equal(t, float64(2939), data["total_amount"])
}

// UT-HANDLER-ORDER-003: List orders
func TestOrderHandler_List(t *testing.T) {
	r, db, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)
	seedJourney(t, db)

	for i := 0; i < 2; i++ {
		body, _ := json.Marshal(model.CreateOrderRequest{
			Items: []model.CreateOrderItemRequest{{JourneySlug: "test-journey", Quantity: 1}},
		})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/orders", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+token)
		r.ServeHTTP(w, req)
		require.Equal(t, http.StatusCreated, w.Code)
	}

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/orders", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	data := res["data"].([]interface{})
	assert.Len(t, data, 2)
}

// UT-HANDLER-ORDER-004: Pay order success
func TestOrderHandler_Pay_Success(t *testing.T) {
	r, db, userRepo, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)
	seedJourney(t, db)

	// Recharge
	body, _ := json.Marshal(model.RechargeRequest{Amount: 10000})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/payments/recharge", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusOK, w.Code)

	// Create order
	body, _ = json.Marshal(model.CreateOrderRequest{
		Items: []model.CreateOrderItemRequest{{JourneySlug: "test-journey", Quantity: 1}},
	})
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", "/api/orders", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var createRes map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &createRes))
	orderID := int64(createRes["data"].(map[string]interface{})["id"].(float64))

	// Pay
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", fmt.Sprintf("/api/orders/%d/pay", orderID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code)
	var payRes map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &payRes))
	assert.Equal(t, true, payRes["data"].(map[string]interface{})["paid"])

	// Verify balance deducted
	uid := int64(createRes["data"].(map[string]interface{})["user_id"].(float64))
	user, err := userRepo.GetByID(t.Context(), uid)
	require.NoError(t, err)
	assert.Equal(t, 10000-2939, user.Balance)
}

// UT-HANDLER-ORDER-005: Pay order insufficient balance
func TestOrderHandler_Pay_InsufficientBalance(t *testing.T) {
	r, db, _, captchaStore := setupOrderPaymentTestRouter(t)
	token := registerAndGetToken(t, r, captchaStore)
	seedJourney(t, db)

	// Create order without recharging
	body, _ := json.Marshal(model.CreateOrderRequest{
		Items: []model.CreateOrderItemRequest{{JourneySlug: "test-journey", Quantity: 1}},
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/orders", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code)

	var createRes map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &createRes))
	orderID := int64(createRes["data"].(map[string]interface{})["id"].(float64))

	// Try to pay
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("POST", fmt.Sprintf("/api/orders/%d/pay", orderID), nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusPaymentRequired, w.Code)
}
