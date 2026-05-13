package middleware

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS returns a CORS middleware with whitelist support.
// Allowed origins are read from CORS_ORIGINS env var (comma-separated).
// If empty, defaults to localhost dev origins.
func CORS() gin.HandlerFunc {
	origins := os.Getenv("CORS_ORIGINS")
	var whitelist []string
	if origins != "" {
		whitelist = strings.Split(origins, ",")
		for i := range whitelist {
			whitelist[i] = strings.TrimSpace(whitelist[i])
		}
	} else {
		whitelist = []string{
			"http://localhost:8080",
			"http://localhost:8090",
			"http://localhost:5173",
			"http://127.0.0.1:8080",
			"http://127.0.0.1:8090",
		}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		allowed := false
		for _, o := range whitelist {
			if o == origin || o == "*" {
				allowed = true
				break
			}
		}

		if allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
		c.Writer.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
