package handler

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func setupAdminTestRouter(t *testing.T) (*gin.Engine, repository.UserRepository) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	userRepo := repository.NewUserRepository(db)
	journeyRepo := repository.NewJourneyRepository(db)
	adminH := NewAdminHandler(userRepo, journeyRepo)

	r := gin.New()
	api := r.Group("/api")
	AdminRoutes(api, adminH)
	return r, userRepo
}

func TestAdmin_Stats_AdminAccess(t *testing.T) {
	r, userRepo := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("adminpass"), bcrypt.DefaultCost)
	admin := &model.User{Username: "admin", Email: "admin@example.com", PasswordHash: string(hash), Role: model.RoleAdmin, Level: 1}
	require.NoError(t, userRepo.Create(ctx, admin))

	token, _ := middleware.GenerateToken(admin)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}

func TestAdmin_Stats_UserForbidden(t *testing.T) {
	r, userRepo := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("userpass"), bcrypt.DefaultCost)
	user := &model.User{Username: "regular", Email: "user@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	token, _ := middleware.GenerateToken(user)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdmin_Stats_NoToken(t *testing.T) {
	r, _ := setupAdminTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/stats", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAdmin_Users_AdminAccess(t *testing.T) {
	r, userRepo := setupAdminTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("adminpass"), bcrypt.DefaultCost)
	admin := &model.User{Username: "admin2", Email: "admin2@example.com", PasswordHash: string(hash), Role: model.RoleAdmin, Level: 1}
	require.NoError(t, userRepo.Create(ctx, admin))

	token, _ := middleware.GenerateToken(admin)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/admin/users", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
}
