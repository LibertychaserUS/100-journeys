package handler

import (
	"bytes"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

func setupAuthTestRouter(t *testing.T) (*gin.Engine, repository.UserRepository, *service.CaptchaStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })

	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))

	userRepo := repository.NewUserRepository(db)
	captchaStore := service.NewCaptchaStore()
	authH := NewAuthHandler(userRepo, captchaStore, filepath.Join(t.TempDir(), "avatars"))

	r := gin.New()
	api := r.Group("/api")
	{
		api.POST("/auth/register", authH.Register)
		api.POST("/auth/login", authH.Login)
		auth := api.Group("/auth")
		auth.Use(middleware.JWTAuth())
		{
			auth.GET("/me", authH.Me)
			auth.POST("/avatar", authH.UploadAvatar)
		}
	}
	return r, userRepo, captchaStore
}

func TestAuth_Register_Success(t *testing.T) {
	r, _, captchaStore := setupAuthTestRouter(t)
	cid, _, answer := captchaStore.Generate()

	body, _ := json.Marshal(model.RegisterRequest{
		Username:      "testuser",
		Email:         "test@example.com",
		Password:      "password123",
		Gender:        "female",
		CaptchaID:     cid,
		CaptchaAnswer: answer,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Logf("Register response: %s", w.Body.String())
	}
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
	r, _, captchaStore := setupAuthTestRouter(t)
	cid1, _, ans1 := captchaStore.Generate()

	body, _ := json.Marshal(model.RegisterRequest{
		Username:      "user1",
		Email:         "dup@example.com",
		Password:      "password123",
		Gender:        "prefer_not_to_say",
		CaptchaID:     cid1,
		CaptchaAnswer: ans1,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	assert.Equal(t, http.StatusCreated, w.Code)

	// Second registration with same email
	cid2, _, ans2 := captchaStore.Generate()
	body2, _ := json.Marshal(model.RegisterRequest{
		Username:      "user2",
		Email:         "dup@example.com",
		Password:      "password123",
		Gender:        "prefer_not_to_say",
		CaptchaID:     cid2,
		CaptchaAnswer: ans2,
	})
	w2 := httptest.NewRecorder()
	req2, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body2))
	req2.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w2, req2)

	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestAuth_Register_ValidationError(t *testing.T) {
	r, _, captchaStore := setupAuthTestRouter(t)
	cid, _, ans := captchaStore.Generate()

	body, _ := json.Marshal(model.RegisterRequest{
		Username:      "ab", // too short
		Email:         "not-an-email",
		Password:      "123", // too short
		Gender:        "prefer_not_to_say",
		CaptchaID:     cid,
		CaptchaAnswer: ans,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAuth_Register_DuplicateUsernameAllowed(t *testing.T) {
	r, _, captchaStore := setupAuthTestRouter(t)
	for i := 0; i < 2; i++ {
		cid, _, ans := captchaStore.Generate()
		body, _ := json.Marshal(model.RegisterRequest{
			Username:      "同名旅人",
			Email:         "same-name-" + string(rune('a'+i)) + "@example.com",
			Password:      "password123",
			Gender:        "male",
			CaptchaID:     cid,
			CaptchaAnswer: ans,
		})
		w := httptest.NewRecorder()
		req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	}
}

func TestAuth_Register_IgnoresInjectedAdminRole(t *testing.T) {
	r, userRepo, captchaStore := setupAuthTestRouter(t)
	cid, _, ans := captchaStore.Generate()

	body := []byte(`{
		"username":"游客不可见管理员",
		"email":"role-injection@example.com",
		"password":"password123",
		"gender":"female",
		"captcha_id":"` + cid + `",
		"captcha_answer":"` + ans + `",
		"role":"admin"
	}`)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	user, err := userRepo.GetByEmail(t.Context(), "role-injection@example.com")
	require.NoError(t, err)
	require.NotNil(t, user)
	require.Equal(t, model.RoleUser, user.Role)
}

func TestAuth_Register_RejectsUnsafeUsernameAndPassword(t *testing.T) {
	r, _, captchaStore := setupAuthTestRouter(t)
	cid, _, ans := captchaStore.Generate()

	body, _ := json.Marshal(model.RegisterRequest{
		Username:      "bad<script>",
		Email:         "unsafe@example.com",
		Password:      "abc 123<script>",
		Gender:        "female",
		CaptchaID:     cid,
		CaptchaAnswer: ans,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAuth_Login_Success(t *testing.T) {
	r, userRepo, captchaStore := setupAuthTestRouter(t)
	ctx := t.Context()

	// Create user manually
	hash, _ := bcrypt.GenerateFromPassword([]byte("mypassword"), bcrypt.DefaultCost)
	user := &model.User{Username: "loginuser", Email: "login@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	cid, _, ans := captchaStore.Generate()
	body, _ := json.Marshal(model.LoginRequest{
		Email:         "login@example.com",
		Password:      "mypassword",
		CaptchaID:     cid,
		CaptchaAnswer: ans,
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
	r, userRepo, captchaStore := setupAuthTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("correct"), bcrypt.DefaultCost)
	user := &model.User{Username: "wrongpass", Email: "wrong@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1}
	require.NoError(t, userRepo.Create(ctx, user))

	cid, _, ans := captchaStore.Generate()
	body, _ := json.Marshal(model.LoginRequest{
		Email:         "wrong@example.com",
		Password:      "incorrect",
		CaptchaID:     cid,
		CaptchaAnswer: ans,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Login_NonexistentUser(t *testing.T) {
	r, _, captchaStore := setupAuthTestRouter(t)
	cid, _, ans := captchaStore.Generate()

	body, _ := json.Marshal(model.LoginRequest{
		Email:         "nobody@example.com",
		Password:      "password123",
		CaptchaID:     cid,
		CaptchaAnswer: ans,
	})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Me_Success(t *testing.T) {
	r, userRepo, _ := setupAuthTestRouter(t)
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
	r, _, _ := setupAuthTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/me", nil)
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_Me_InvalidToken(t *testing.T) {
	r, _, _ := setupAuthTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/auth/me", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	r.ServeHTTP(w, req)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAuth_UploadAvatar_BindsFileToUserID(t *testing.T) {
	r, userRepo, _ := setupAuthTestRouter(t)
	ctx := t.Context()

	hash, _ := bcrypt.GenerateFromPassword([]byte("pass1234"), bcrypt.DefaultCost)
	user := &model.User{Username: "avataruser", Email: "avatar@example.com", PasswordHash: string(hash), Role: model.RoleUser, Level: 1, Gender: "female"}
	require.NoError(t, userRepo.Create(ctx, user))

	token, err := middleware.GenerateToken(user)
	require.NoError(t, err)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("avatar", "avatar.png")
	require.NoError(t, err)
	_, err = part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0})
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/avatar", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("Authorization", "Bearer "+token)
	r.ServeHTTP(w, req)

	require.Equal(t, http.StatusOK, w.Code, w.Body.String())
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]interface{})
	require.Equal(t, user.ID, int64(data["user_id"].(float64)))
	require.Contains(t, data["avatar_url"], "/u_"+stringNumber(user.ID)+"/avatar.png")

	found, err := userRepo.GetByID(ctx, user.ID)
	require.NoError(t, err)
	require.Contains(t, found.AvatarURL, "/u_"+stringNumber(user.ID)+"/avatar.png")
}

func stringNumber(id int64) string {
	return strconv.FormatInt(id, 10)
}
