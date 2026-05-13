package handler

// JourneyHandler — Gin HTTP handlers.
// Implementation populated in SDD phase after API contract finalization.

import "github.com/gin-gonic/gin"

type JourneyHandler struct {
	// svc *service.JourneyService  — injected after SDD phase
}

// GET /api/journeys
func (h *JourneyHandler) List(c *gin.Context) {
	c.JSON(200, gin.H{"data": []interface{}{}, "total": 0})
}

// GET /api/journeys/:slug
func (h *JourneyHandler) Get(c *gin.Context) {
	c.JSON(200, gin.H{"data": nil})
}

// GET /api/tags
func (h *JourneyHandler) ListTags(c *gin.Context) {
	c.JSON(200, gin.H{"data": []interface{}{}})
}
