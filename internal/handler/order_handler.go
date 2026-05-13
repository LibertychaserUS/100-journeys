package handler

import (
	"net/http"
	"strconv"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
)

type OrderHandler struct {
	orderRepo   repository.OrderRepository
	journeyRepo repository.JourneyRepository
	userRepo    repository.UserRepository
}

func NewOrderHandler(orderRepo repository.OrderRepository, journeyRepo repository.JourneyRepository, userRepo repository.UserRepository) *OrderHandler {
	return &OrderHandler{orderRepo: orderRepo, journeyRepo: journeyRepo, userRepo: userRepo}
}

// computeDiscount returns discount percent (0-15) based on points.
func computeDiscount(points int) int {
	switch {
	case points >= 100000:
		return 15
	case points >= 50000:
		return 12
	case points >= 20000:
		return 8
	case points >= 10000:
		return 5
	case points >= 5000:
		return 2
	default:
		return 0
	}
}

// POST /api/orders
func (h *OrderHandler) Create(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	var req model.CreateOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	// Get user for discount
	user, err := h.userRepo.GetByID(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	discount := computeDiscount(user.Points)

	var items []model.OrderItem
	for _, ri := range req.Items {
		j, err := h.journeyRepo.GetBySlug(c.Request.Context(), ri.JourneySlug)
		if err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
			return
		}
		if j == nil {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("journey not found: "+ri.JourneySlug))
			return
		}
		unitPrice := j.Price * (100 - discount) / 100
		if unitPrice < 0 {
			unitPrice = 0
		}
		items = append(items, model.OrderItem{
			JourneyID:    j.ID,
			JourneyTitle: j.Title,
			UnitPrice:    unitPrice,
			Quantity:     ri.Quantity,
		})
	}

	order, err := h.orderRepo.Create(c.Request.Context(), uid, items)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusCreated, newDataEnvelope(order))
}

// GET /api/orders
func (h *OrderHandler) List(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	orders, err := h.orderRepo.ListByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(orders))
}

// GET /api/orders/:id
func (h *OrderHandler) Get(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid order id"))
		return
	}

	order, err := h.orderRepo.GetByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	if order == nil || order.UserID != uid {
		c.JSON(http.StatusNotFound, newErrorEnvelope("order not found"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(order))
}

// POST /api/orders/:id/pay
func (h *OrderHandler) Pay(c *gin.Context) {
	userID, _ := c.Get("user_id")
	uid := userID.(int64)

	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid order id"))
		return
	}

	if err := h.orderRepo.Pay(c.Request.Context(), id, uid); err != nil {
		if err.Error() == "insufficient balance" {
			c.JSON(http.StatusPaymentRequired, newErrorEnvelope(err.Error()))
			return
		}
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"paid": true}))
}

// OrderRoutes registers order routes under the provided group.
func OrderRoutes(api *gin.RouterGroup, h *OrderHandler) {
	orders := api.Group("/orders")
	orders.Use(middleware.JWTAuth())
	{
		orders.POST("", h.Create)
		orders.GET("", h.List)
		orders.GET("/:id", h.Get)
		orders.POST("/:id/pay", h.Pay)
	}
}
