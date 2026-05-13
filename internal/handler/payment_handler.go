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

	if err := h.userRepo.Recharge(c.Request.Context(), uid, req.Amount, "模拟充值"); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"recharged": req.Amount}))
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
	payments := api.Group("/payments")
	payments.Use(middleware.JWTAuth())
	{
		payments.POST("/recharge", h.Recharge)
		payments.GET("/transactions", h.Transactions)
	}
}
