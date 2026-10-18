package handler

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"sync"
	"time"

	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

// maxCompositions caps how many tickets one account keeps.
const maxCompositions = 200

var (
	compositionID   = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)
	compositionCode = regexp.MustCompile(`^[a-z0-9]{12}$`)
)

// ComposeHandler serves the compose game: the paper slips, kept tickets and share links.
type ComposeHandler struct {
	repo      repository.CompositionRepository
	fragments []compose.Fragment
	known     compose.Set
	journeys  *service.JourneyService

	coversOnce sync.Once
	covers     map[string]string // entrance slug -> resolved cover URL
}

func NewComposeHandler(repo repository.CompositionRepository, fragments []compose.Fragment, journeys *service.JourneyService) *ComposeHandler {
	return &ComposeHandler{repo: repo, fragments: fragments, known: compose.NewSet(fragments), journeys: journeys}
}

// GET /api/compose/fragments?lang=
func (h *ComposeHandler) Fragments(c *gin.Context) {
	covers := h.coverURLs(c.Request.Context())
	lang := service.NormalizeLocale(c.Query("lang"))
	out := make([]compose.Localized, 0, len(h.fragments))
	for _, group := range compose.Groups {
		for _, f := range h.fragments {
			if f.Group != group {
				continue
			}
			l := f.Localize(lang)
			if l.Slug != "" {
				if url, ok := covers[l.Slug]; ok {
					l.ImageURL = url
				} else {
					l.Slug = "" // never link a ticket to a journey that does not exist
				}
			}
			out = append(out, l)
		}
	}
	c.Header("Cache-Control", "public, max-age=300")
	c.JSON(http.StatusOK, newDataEnvelope(out))
}

// coverURLs resolves each linked entrance's cover once; content is synced before the server starts.
func (h *ComposeHandler) coverURLs(ctx context.Context) map[string]string {
	h.coversOnce.Do(func() {
		h.covers = map[string]string{}
		for _, f := range h.fragments {
			if f.Slug == "" {
				continue
			}
			if j, err := h.journeys.GetJourney(ctx, f.Slug); err == nil {
				h.covers[f.Slug] = j.ImageURL
			}
		}
	})
	return h.covers
}

// GET /api/auth/compositions
func (h *ComposeHandler) List(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	list, err := h.repo.ListByUser(c.Request.Context(), uid)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load compositions"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(list))
}

// POST /api/auth/compositions — idempotent on the client-generated id: keeping the same ticket
// again (a replay after sign-in, or lines filled in later) updates it and keeps its share code.
func (h *ComposeHandler) Keep(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	var req model.KeepCompositionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid composition"))
		return
	}
	if !compositionID.MatchString(req.ID) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("invalid composition id"))
		return
	}
	picked := 0
	for _, group := range compose.Groups {
		key := req.Picks.ByGroup()[group]
		if key == "" {
			continue
		}
		if !h.known.Has(group, key) {
			c.JSON(http.StatusBadRequest, newErrorEnvelope("unknown slip "+group+":"+key))
			return
		}
		picked++
	}
	if picked == 0 {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("composition needs at least one slip"))
		return
	}
	createdAt, _ := time.Parse(time.RFC3339, req.CreatedAt)
	parent := req.ParentCode
	if !compositionCode.MatchString(parent) {
		parent = ""
	}

	saved, created, err := h.repo.Upsert(c.Request.Context(), &model.Composition{ID: req.ID, UserID: uid, Picks: req.Picks, ParentCode: parent, CreatedAt: createdAt}, maxCompositions)
	switch {
	case errors.Is(err, repository.ErrCompositionTaken), errors.Is(err, repository.ErrCompositionPosted):
		c.JSON(http.StatusConflict, newErrorEnvelope(err.Error()))
	case errors.Is(err, repository.ErrCompositionLimit):
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
	case err != nil:
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to keep composition"))
	case created:
		c.JSON(http.StatusCreated, newDataEnvelope(saved))
	default:
		c.JSON(http.StatusOK, newDataEnvelope(saved))
	}
}

// DELETE /api/auth/compositions/:id
func (h *ComposeHandler) Delete(c *gin.Context) {
	uid := c.MustGet("user_id").(int64)
	id := c.Param("id")
	if !compositionID.MatchString(id) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	deleted, err := h.repo.Delete(c.Request.Context(), uid, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to delete composition"))
		return
	}
	if !deleted {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"id": id, "deleted": true}))
}

// GET /api/compositions/:code — public, read-only share view.
func (h *ComposeHandler) Shared(c *gin.Context) {
	code := c.Param("code")
	if !compositionCode.MatchString(code) {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	comp, err := h.repo.GetByCode(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to load composition"))
		return
	}
	if comp == nil {
		c.JSON(http.StatusNotFound, newErrorEnvelope("composition not found"))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(model.SharedComposition{Code: comp.Code, Picks: comp.Picks, CreatedAt: comp.CreatedAt}))
}

// ComposeRoutes registers the public slip and share routes plus the signed-in ticket routes.
func ComposeRoutes(api *gin.RouterGroup, h *ComposeHandler) {
	api.GET("/compose/fragments", h.Fragments)
	api.GET("/compositions/:code", h.Shared)
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.GET("/compositions", h.List)
	auth.POST("/compositions", h.Keep)
	auth.DELETE("/compositions/:id", h.Delete)
}
