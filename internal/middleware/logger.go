package middleware

import (
	"time"

	"github.com/gin-gonic/gin"
	"log"
)

// Logger returns a structured request logging middleware.
func Logger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery

		c.Next()

		latency := time.Since(start)
		clientIP := c.ClientIP()
		method := c.Request.Method
		statusCode := c.Writer.Status()
		requestID := c.GetString("request_id")

		if raw != "" {
			path = path + "?" + raw
		}

		// Skip static asset requests to reduce terminal noise
		if len(path) > 8 && path[:8] == "/static/" {
			return
		}

		log.Printf("[%s] %s %s | %d | %v | %s",
			requestID, method, path, statusCode, latency, clientIP)
	}
}
