package handler

import (
	"net/http"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	userRepo    repository.UserRepository
	journeyRepo repository.JourneyRepository
}

func NewAdminHandler(userRepo repository.UserRepository, journeyRepo repository.JourneyRepository) *AdminHandler {
	return &AdminHandler{userRepo: userRepo, journeyRepo: journeyRepo}
}

// GET /api/admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	// TODO: add pagination
	c.JSON(http.StatusOK, newDataEnvelope([]model.User{}))
}

// GET /api/admin/stats
func (h *AdminHandler) Stats(c *gin.Context) {
	stats := gin.H{
		"total_users":   0,
		"total_journeys": 5,
		"total_points":  0,
	}
	c.JSON(http.StatusOK, newDataEnvelope(stats))
}

// AdminRoutes registers admin routes with RequireAdmin middleware.
func AdminRoutes(r *gin.RouterGroup, h *AdminHandler) {
	admin := r.Group("/admin")
	admin.Use(middleware.JWTAuth(), middleware.RequireAdmin())
	{
		admin.GET("/users", h.ListUsers)
		admin.GET("/stats", h.Stats)
	}
}
