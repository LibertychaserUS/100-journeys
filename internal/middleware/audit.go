package middleware

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// AuditLogger persists API request evidence and all API errors.
// Static assets are intentionally excluded; image throughput is measured separately.
func AuditLogger(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()

		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/static/") || strings.HasPrefix(path, "/uploads/") {
			return
		}
		level := "info"
		status := c.Writer.Status()
		if status >= 500 {
			level = "error"
		} else if status >= 400 {
			level = "warn"
		}

		raw := c.Request.URL.RawQuery
		if raw != "" {
			path += "?" + raw
		}
		message := ""
		if len(c.Errors) > 0 {
			message = c.Errors.String()
			level = "error"
		}

		ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
		defer cancel()
		if err := insertAuditLog(ctx, db, auditRecord{
			RequestID:  c.GetString("request_id"),
			Level:      level,
			Source:     "api",
			Method:     c.Request.Method,
			Path:       path,
			StatusCode: status,
			LatencyMS:  int(time.Since(start).Milliseconds()),
			ClientIP:   c.ClientIP(),
			UserAgent:  c.Request.UserAgent(),
			Message:    message,
		}); err != nil {
			log.Printf("audit log insert failed: %v", err)
		}
	}
}

func AuditRecovery(db *sql.DB) gin.HandlerFunc {
	return gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		path := c.Request.URL.Path
		if raw := c.Request.URL.RawQuery; raw != "" {
			path += "?" + raw
		}
		ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
		defer cancel()
		if err := insertAuditLog(ctx, db, auditRecord{
			RequestID:  c.GetString("request_id"),
			Level:      "panic",
			Source:     "api",
			Method:     c.Request.Method,
			Path:       path,
			StatusCode: 500,
			ClientIP:   c.ClientIP(),
			UserAgent:  c.Request.UserAgent(),
			Message:    fmt.Sprint(recovered),
		}); err != nil {
			log.Printf("panic audit insert failed: %v", err)
		}
		c.AbortWithStatusJSON(500, gin.H{"data": nil, "error": "internal server error"})
	})
}

type auditRecord struct {
	RequestID  string
	Level      string
	Source     string
	Method     string
	Path       string
	StatusCode int
	LatencyMS  int
	ClientIP   string
	UserAgent  string
	Message    string
}

func insertAuditLog(ctx context.Context, db *sql.DB, record auditRecord) error {
	_, err := db.ExecContext(ctx,
		`INSERT INTO audit_logs (request_id, level, source, method, path, status_code, latency_ms, client_ip, user_agent, message)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		record.RequestID,
		record.Level,
		record.Source,
		record.Method,
		record.Path,
		record.StatusCode,
		record.LatencyMS,
		record.ClientIP,
		record.UserAgent,
		record.Message,
	)
	return err
}
