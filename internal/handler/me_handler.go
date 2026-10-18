package handler

import (
	"net/http"
	"strings"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

// MeHandler serves the signed-in user's own data: saved journeys and travel personality.
type MeHandler struct {
	userRepo repository.UserRepository
	journeys *service.JourneyService
}

func NewMeHandler(userRepo repository.UserRepository, journeys *service.JourneyService) *MeHandler {
	return &MeHandler{userRepo: userRepo, journeys: journeys}
}

var mbtiCodes = map[string]bool{
	"INTJ": true, "INTP": true, "ENTJ": true, "ENTP": true,
	"INFJ": true, "INFP": true, "ENFJ": true, "ENFP": true,
	"ISTJ": true, "ISFJ": true, "ESTJ": true, "ESFJ": true,
	"ISTP": true, "ISFP": true, "ESTP": true, "ESFP": true,
}

type updateMBTIRequest struct {
	MBTIType string `json:"mbti_type" binding:"required"`
}

// GET /api/auth/saved
func (h *MeHandler) ListSaved(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	ids, err := h.userRepo.ListSavedJourneys(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load saved journeys"))
		return
	}
	journeys, err := h.journeys.ListJourneysByIDs(c.Request.Context(), ids, c.Query("lang"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load saved journeys"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(journeys))
}

// PUT /api/auth/saved/:slug
func (h *MeHandler) Save(c *gin.Context) {
	h.toggle(c, true)
}

// DELETE /api/auth/saved/:slug
func (h *MeHandler) Unsave(c *gin.Context) {
	h.toggle(c, false)
}

func (h *MeHandler) toggle(c *gin.Context, save bool) {
	uid := c.MustGet("user_id").(int64)
	slug := c.Param("slug")
	journey, err := h.journeys.GetJourney(c.Request.Context(), slug)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to update saved journeys"))
		return
	}
	if save {
		err = h.userRepo.SaveJourney(c.Request.Context(), uid, journey.ID)
	} else {
		err = h.userRepo.UnsaveJourney(c.Request.Context(), uid, journey.ID)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to update saved journeys"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"slug": slug, "saved": save}))
}

// PUT /api/auth/mbti
func (h *MeHandler) UpdateMBTI(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	var req updateMBTIRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid mbti type"))
		return
	}
	code := strings.ToUpper(strings.TrimSpace(req.MBTIType))
	if !mbtiCodes[code] {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid mbti type"))
		return
	}
	if err := h.userRepo.UpdateMBTI(c.Request.Context(), uid, code); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save mbti type"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"mbti_type": code}))
}

// MeRoutes registers the signed-in user's routes under /api/auth and returns the group.
func MeRoutes(api *gin.RouterGroup, h *MeHandler) *gin.RouterGroup {
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.GET("/saved", h.ListSaved)
	auth.PUT("/saved/:slug", h.Save)
	auth.DELETE("/saved/:slug", h.Unsave)
	auth.PUT("/mbti", h.UpdateMBTI)
	return auth
}
