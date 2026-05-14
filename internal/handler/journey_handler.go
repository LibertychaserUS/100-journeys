package handler

import (
	"net/http"
	"strings"

	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/analytics"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

type JourneyHandler struct {
	svc    *service.JourneyService
	ai     ai.Provider
	engine *ai.RecommendEngine
	events *analytics.Buffer
}

func NewJourneyHandler(svc *service.JourneyService, aiProvider ai.Provider, engine *ai.RecommendEngine, buffers ...*analytics.Buffer) *JourneyHandler {
	var events *analytics.Buffer
	if len(buffers) > 0 {
		events = buffers[0]
	}
	return &JourneyHandler{
		svc:    svc,
		ai:     aiProvider,
		engine: engine,
		events: events,
	}
}

// GET /api/journeys
func (h *JourneyHandler) List(c *gin.Context) {
	var filter model.JourneyFilter
	if err := c.ShouldBindQuery(&filter); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	journeys, total, err := h.svc.ListJourneys(c.Request.Context(), filter)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newListEnvelope(journeys, total, filter.Page, filter.Limit))
}

// GET /api/journeys/:slug
func (h *JourneyHandler) Get(c *gin.Context) {
	slug := c.Param("slug")
	journey, err := h.svc.GetJourney(c.Request.Context(), slug)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	h.trackEvent(analytics.Event{Type: analytics.EventJourneyView, JourneySlug: slug})
	c.JSON(http.StatusOK, newDataEnvelope(journey))
}

// GET /api/tags
func (h *JourneyHandler) ListTags(c *gin.Context) {
	tags, err := h.svc.ListTags(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(tags))
}

// GET /api/mbti
func (h *JourneyHandler) ListMBTITypes(c *gin.Context) {
	types, err := h.svc.ListMBTITypes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(types))
}

// GET /api/journeys/:slug/book
func (h *JourneyHandler) GetBookingInfo(c *gin.Context) {
	slug := c.Param("slug")
	info, err := h.svc.GetBookingInfo(c.Request.Context(), slug)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			c.JSON(http.StatusNotFound, newErrorEnvelope("journey not found"))
			return
		}
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(info))
}

// POST /api/ai/chat
func (h *JourneyHandler) AIChat(c *gin.Context) {
	var req model.AIChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	reply, actions, err := h.ai.Chat(c.Request.Context(), req.SessionID, req.Message)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	resp := model.AIChatResponse{
		Reply:   reply,
		Actions: actions,
	}
	h.trackEvent(analytics.Event{Type: analytics.EventPetReply})
	c.JSON(http.StatusOK, newDataEnvelope(resp))
}

// POST /api/analytics/events
func (h *JourneyHandler) TrackAnalytics(c *gin.Context) {
	var req model.AnalyticsEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}
	accepted := h.trackEvent(analytics.Event{
		Type:        req.Type,
		JourneySlug: req.JourneySlug,
		MBTIType:    req.MBTIType,
		Gender:      req.Gender,
		Metadata:    req.Metadata,
	})
	c.JSON(http.StatusAccepted, newDataEnvelope(model.AnalyticsTrackResponse{Accepted: accepted}))
}

// GET /api/health
func (h *JourneyHandler) Health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"data": map[string]string{"status": "ok"}, "error": nil})
}

func (h *JourneyHandler) trackEvent(event analytics.Event) bool {
	if h.events == nil {
		return false
	}
	return h.events.Track(event)
}

// ------------------------------------------------------------------
// JSON envelope helpers
// ------------------------------------------------------------------

func newDataEnvelope(data interface{}) gin.H {
	return gin.H{"data": data, "error": nil}
}

func newListEnvelope(data interface{}, total, page, limit int) gin.H {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 {
		limit = 12
	}
	return gin.H{
		"data":  data,
		"error": nil,
		"total": total,
		"page":  page,
		"limit": limit,
	}
}

func newErrorEnvelope(errMsg string) gin.H {
	return gin.H{"data": nil, "error": errMsg}
}
