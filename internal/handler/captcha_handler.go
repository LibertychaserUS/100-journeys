package handler

import (
	"net/http"

	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

type CaptchaHandler struct {
	store *service.CaptchaStore
}

func NewCaptchaHandler(store *service.CaptchaStore) *CaptchaHandler {
	return &CaptchaHandler{store: store}
}

// GET /api/captcha
func (h *CaptchaHandler) Generate(c *gin.Context) {
	id, question, _ := h.store.Generate()
	c.JSON(http.StatusOK, newDataEnvelope(gin.H{
		"id":       id,
		"question": question,
	}))
}
