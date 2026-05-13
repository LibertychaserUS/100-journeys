package handler

import (
	"bytes"
	"encoding/json"
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

func setupAuthTestRouter(t *testing.T) (*gin.Engine, repository.UserRepository) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	userRepo := repository.NewUserRepository(db)
	authH := NewAuthHandler(userRepo)

	r := gin.New()
	api := r.Group("/api")
	{
		api.POST("/auth/register", authH.Register)
		api.POST("/auth/login", authH.Login)
		auth := api.Group("/auth")
		auth.Use(middleware.JWTAuth())
		{
			auth.GET("/me", authH.Me)
		}
	}
	return r, userRepo
}

func TestAuth_Register_Success(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	body, _ := json.Marshal(model.RegisterRequest{
		Username: "testuser",
		Email:    "test@example.com",
		Password: "password123",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusCreated, w.Code)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.NotEmpty(t, data["token"])
	user := data["user"].(map[string]interface{})
	assert.Equal(t, "testuser", user["username"])
	assert.Equal(t, float64(5000), user["points"]) // registration bonus
}

func TestAuth_Register_DuplicateEmail(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	body, _ := json.Marshal(model.RegisterRequest{
		Username: "user1",
		Email:    "dup@example.com",
		Password: "password123",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	// Second registration with same email
	body2, _ := json.Marshal(model.RegisterRequest{
		Username: "user2",
		Email:    "dup@example.com",
		Password: "password123",
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestAuth_Register_ValidationError(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	body, _ := json.Marshal(model.RegisterRequest{
		Username: "ab", // too short
		Email:    "not-an-email",
		Password: "123", // too short
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAuth_Login_Success(t *testing.T) {
	r, userRepo := setupAuthTestRouter(t)
	ctx := t.Context()

	// Create user manually
	hash, _ := bcrypt.GenerateFromPassword([]byte("mypassword"), bcrypt.DefaultCost)
	user := &model.User{Username: "loginuser", Email: "login@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	body, _ := json.Marshal(model.LoginRequest{
		Email:    "login@example.com",
		Password: "mypassword",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.NotEmpty(t, data["token"])
}

func TestAuth_Login_WrongPassword(t *testing.T) {
	r, userRepo := setupAuthTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("correct"), bcrypt.DefaultCost)
	user := &model.User{Username: "wrongpass", Email: "wrong@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	body, _ := json.Marshal(model.LoginRequest{
		Email:    "wrong@example.com",
		Password: "incorrect",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Login_NonexistentUser(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	body, _ := json.Marshal(model.LoginRequest{
		Email:    "nobody@example.com",
		Password: "password123",
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Me_Success(t *testing.T) {
	r, userRepo := setupAuthTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("pass"), bcrypt.DefaultCost)
	user := &model.User{Username: "meuser", Email: "me@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	token, err := middleware.GenerateToken(user)
	require.NoError(t, err)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	assert.Equal(t, "meuser", data["username"])
}

func TestAuth_Me_NoToken(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/me", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Me_InvalidToken(t *testing.T) {
	r, _ := setupAuthTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
