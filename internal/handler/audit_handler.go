package handler

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type AuditHandler struct {
	db *sql.DB
}

func NewAuditHandler(db *sql.DB) *AuditHandler {
	return &AuditHandler{db: db}
}

type clientErrorRequest struct {
	Message string `json:"message" binding:"required"`
	Path    string `json:"path"`
	Stack   string `json:"stack"`
}

func (h *AuditHandler) ClientError(c *gin.Context) {
	var req clientErrorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}
	message := req.Message
	if req.Stack != "" {
		message += "\n" + req.Stack
	}
	path := req.Path
	if path == "" {
		path = c.GetHeader("Referer")
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 500*time.Millisecond)
	defer cancel()
	_, err := h.db.ExecContext(ctx,
		`INSERT INTO audit_logs (request_id, level, source, method, path, status_code, client_ip, user_agent, message)
		 VALUES (?, 'error', 'frontend', 'CLIENT', ?, 0, ?, ?, ?)`,
		c.GetString("request_id"),
		path,
		c.ClientIP(),
		c.Request.UserAgent(),
		message,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to record client error"))
		return
	}
	c.JSON(http.StatusAccepted, newDataEnvelope(gin.H{"recorded": true}))
}
