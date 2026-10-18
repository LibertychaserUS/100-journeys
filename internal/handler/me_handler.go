package handler

import (
	"errors"
	"net/http"
	"sort"
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

type setChoiceRequest struct {
	Key string `json:"key" binding:"required"`
}

// mergeGuestRequest is what a visitor chose before signing in (docs/content/SCHEMA.md, guest state).
type mergeGuestRequest struct {
	MBTIType string            `json:"mbti_type"`
	Choices  map[string]string `json:"choices"`
}

type mergeGuestResponse struct {
	MBTIType string            `json:"mbti_type"`
	Choices  map[string]string `json:"choices"`
	Skipped  []string          `json:"skipped"`
}

const maxMergedChoices = 100

var errChoiceNotFound = errors.New("journey not found")
var errChoiceInvalid = errors.New("invalid choice")

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

// GET /api/auth/choices
func (h *MeHandler) ListChoices(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	choices, err := h.userRepo.ListChoices(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load choices"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(choices))
}

// PUT /api/auth/choices/:slug
func (h *MeHandler) SetChoice(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	var req setChoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid choice"))
		return
	}
	slug := c.Param("slug")
	switch err := h.setChoice(c, uid, slug, req.Key); {
	case errors.Is(err, errChoiceNotFound):
		c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
	case errors.Is(err, errChoiceInvalid):
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid choice"))
	case err != nil:
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save choice"))
	default:
		c.JSON(http.StatusOK, newDataEnvelope(gin.H{"slug": slug, "key": req.Key}))
	}
}

// POST /api/auth/guest/merge — applies a guest's type and fork picks to the account. Idempotent:
// the guest's type replaces the account's (it is the most recent choice); picks are upserted;
// unknown journeys or options are skipped and reported.
func (h *MeHandler) MergeGuest(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	var req mergeGuestRequest
	if err := c.ShouldBindJSON(&req); err != nil || len(req.Choices) > maxMergedChoices {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid guest state"))
		return
	}
	resp := mergeGuestResponse{Skipped: []string{}}
	if code := strings.ToUpper(strings.TrimSpace(req.MBTIType)); code != "" {
		if !mbtiCodes[code] {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid mbti type"))
			return
		}
		if err := h.userRepo.UpdateMBTI(c.Request.Context(), uid, code); err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save mbti type"))
			return
		}
		resp.MBTIType = code
	}
	for slug, key := range req.Choices {
		if err := h.setChoice(c, uid, slug, key); err != nil {
			if errors.Is(err, errChoiceNotFound) || errors.Is(err, errChoiceInvalid) {
				resp.Skipped = append(resp.Skipped, slug)
				continue
			}
			c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save choices"))
			return
		}
	}
	sort.Strings(resp.Skipped)
	choices, err := h.userRepo.ListChoices(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load choices"))
		return
	}
	resp.Choices = choices
	if resp.MBTIType == "" {
		if user, err := h.userRepo.GetByID(c.Request.Context(), uid); err == nil {
			resp.MBTIType = user.MBTIType
		}
	}
	c.JSON(http.StatusOK, newDataEnvelope(resp))
}

// setChoice validates key against the journey's authored fork before storing it.
func (h *MeHandler) setChoice(c *gin.Context, uid int64, slug, key string) error {
	journey, err := h.journeys.GetJourneyLocalized(c.Request.Context(), slug, "zh")
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return errChoiceNotFound
		}
		return err
	}
	if journey.Content == nil || journey.Content.Choice == nil {
		return errChoiceInvalid
	}
	for _, o := range journey.Content.Choice.Options {
		if o.Key == key {
			return h.userRepo.SetChoice(c.Request.Context(), uid, journey.ID, key)
		}
	}
	return errChoiceInvalid
}

// MeRoutes registers the signed-in user's routes under /api/auth and returns the group.
func MeRoutes(api *gin.RouterGroup, h *MeHandler) *gin.RouterGroup {
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.GET("/saved", h.ListSaved)
	auth.PUT("/saved/:slug", h.Save)
	auth.DELETE("/saved/:slug", h.Unsave)
	auth.PUT("/mbti", h.UpdateMBTI)
	auth.GET("/choices", h.ListChoices)
	auth.PUT("/choices/:slug", h.SetChoice)
	auth.POST("/guest/merge", h.MergeGuest)
	return auth
}
