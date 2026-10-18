package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/model"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

var jwtSecret = []byte(os.Getenv("JWT_SECRET"))

func init() {
	if len(jwtSecret) == 0 {
		jwtSecret = []byte("100-journeys-dev-secret-change-in-production")
	}
}

// DeriveKey returns a key for purpose derived from the signing secret, so other HMACs (author
// hashes on the Ticket Road) need no secret of their own and never equal the token key.
func DeriveKey(purpose string) []byte {
	m := hmac.New(sha256.New, jwtSecret)
	m.Write([]byte(purpose))
	return m.Sum(nil)
}

// OptionalJWT reads a valid Bearer token when there is one and carries on either way: public
// reads use it to leave out what a signed-in traveller asked not to see.
func OptionalJWT() gin.HandlerFunc {
	return func(c *gin.Context) {
		parts := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			if id, role, ok := parseToken(parts[1]); ok {
				c.Set("user_id", id)
				c.Set("role", role)
			}
		}
		c.Next()
	}
}

func parseToken(tokenStr string) (int64, string, bool) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return jwtSecret, nil
	})
	if err != nil || !token.Valid {
		return 0, "", false
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return 0, "", false
	}
	userID, _ := claims["user_id"].(float64)
	role, _ := claims["role"].(string)
	return int64(userID), role, userID > 0
}

// JWTAuth validates Bearer token and injects user info into context.
func JWTAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization header format"})
			c.Abort()
			return
		}

		tokenStr := parts[1]
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			c.Abort()
			return
		}

		userID, _ := claims["user_id"].(float64)
		role, _ := claims["role"].(string)
		c.Set("user_id", int64(userID))
		c.Set("role", role)
		c.Next()
	}
}

// RequireAdmin aborts with 403 if the authenticated user is not an admin.
func RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role != model.RoleAdmin {
			c.JSON(http.StatusForbidden, gin.H{"error": "admin access required"})
			c.Abort()
			return
		}
		c.Next()
	}
}

// GenerateToken creates a new JWT for the given user.
func GenerateToken(user *model.User) (string, error) {
	claims := jwt.MapClaims{
		"user_id": user.ID,
		"role":    user.Role,
		"exp":     time.Now().Add(7 * 24 * time.Hour).Unix(),
		"iat":     time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}
