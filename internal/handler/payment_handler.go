package handler

import (
	"net/http"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
)

type PaymentHandler struct {
	userRepo repository.UserRepository
	txnRepo  repository.TransactionRepository
}

func NewPaymentHandler(userRepo repository.UserRepository, txnRepo repository.TransactionRepository) *PaymentHandler {
	return &PaymentHandler{userRepo: userRepo, txnRepo: txnRepo}
}

// POST /api/payments/recharge
func (h *PaymentHandler) Recharge(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	var req model.RechargeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	bonus := rechargeBonus(req.Amount)
	balance, err := h.userRepo.RechargeWithBonus(c.Request.Context(), uid, req.Amount, bonus, "模拟充值", "充值赠送")
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("recharge failed"))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"recharged": req.Amount, "bonus": bonus, "balance": balance}))
}

// RechargeTier is a preset top-up amount and the bonus credited with it.
type RechargeTier struct {
	Amount int `json:"amount"`
	Bonus  int `json:"bonus"`
}

// rechargeTiers are sized against journey prices (8,999 – 35,999 不思议币).
var rechargeTiers = []RechargeTier{
	{Amount: 5000, Bonus: 0},
	{Amount: 10000, Bonus: 800},
	{Amount: 20000, Bonus: 2000},
	{Amount: 30000, Bonus: 3600},
	{Amount: 50000, Bonus: 7000},
}

// rechargeBonus returns the bonus for a preset tier; custom amounts earn none.
func rechargeBonus(amount int) int {
	for _, t := range rechargeTiers {
		if t.Amount == amount {
			return t.Bonus
		}
	}
	return 0
}

// GET /api/payments/tiers
func (h *PaymentHandler) Tiers(c *gin.Context) {
	c.JSON(http.StatusOK, newDataEnvelope(rechargeTiers))
}

// GET /api/payments/transactions
func (h *PaymentHandler) Transactions(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	txns, err := h.txnRepo.ListByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(txns))
}

// PaymentRoutes registers payment routes under the provided group.
func PaymentRoutes(api *gin.RouterGroup, h *PaymentHandler) {
	api.GET("/payments/tiers", h.Tiers)
	payments := api.Group("/payments")
	payments.Use(middleware.JWTAuth())
	{
		payments.POST("/recharge", h.Recharge)
		payments.GET("/transactions", h.Transactions)
	}
}
