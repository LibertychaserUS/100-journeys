package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupMeTestRouter(t *testing.T) (*gin.Engine, *service.CaptchaStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))
	require.NoError(t, repository.Seed(db, filepath.Join(projectRoot, "db/seed.sql")))

	userRepo := repository.NewUserRepository(db)
	svc := service.NewJourneyService(repository.NewJourneyRepository(db), &service.LocalProvider{BaseURL: "/static/assets/images"})
	captchaStore := service.NewCaptchaStore()
	authH := NewAuthHandler(userRepo, captchaStore, filepath.Join(t.TempDir(), "avatars"))
	meH := NewMeHandler(userRepo, svc)

	r := gin.New()
	api := r.Group("/api")
	api.POST("/auth/register", authH.Register)
	auth := MeRoutes(api, meH)
	auth.GET("/me", authH.Me)
	return r, captchaStore
}

func doJSON(t *testing.T, r *gin.Engine, method, path, token string, body interface{}) (*httptest.ResponseRecorder, map[string]interface{}) {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, _ := http.NewRequest(method, path, reader)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var resp map[string]interface{}
	_ = json.Unmarshal(w.Body.Bytes(), &resp)
	return w, resp
}

// IT-API-SAVED-001: saving, listing and removing saved journeys.
func TestMe_SavedJourneys_RoundTrip(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)

	w, resp := doJSON(t, r, "GET", "/api/auth/saved", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, resp["data"])

	w, _ = doJSON(t, r, "PUT", "/api/auth/saved/bolivia-salt-flat-trek", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	// Saving twice is idempotent.
	w, _ = doJSON(t, r, "PUT", "/api/auth/saved/bolivia-salt-flat-trek", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	w, _ = doJSON(t, r, "PUT", "/api/auth/saved/japan-onsen-temple-meditation", token, nil)
	require.Equal(t, http.StatusOK, w.Code)

	w, resp = doJSON(t, r, "GET", "/api/auth/saved", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	items := resp["data"].([]interface{})
	require.Len(t, items, 2)
	slugs := []string{items[0].(map[string]interface{})["slug"].(string), items[1].(map[string]interface{})["slug"].(string)}
	assert.ElementsMatch(t, []string{"bolivia-salt-flat-trek", "japan-onsen-temple-meditation"}, slugs)
	assert.NotEmpty(t, items[0].(map[string]interface{})["image_url"], "saved journeys carry resolved cover URLs")

	w, _ = doJSON(t, r, "DELETE", "/api/auth/saved/bolivia-salt-flat-trek", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	w, resp = doJSON(t, r, "GET", "/api/auth/saved", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	require.Len(t, resp["data"].([]interface{}), 1)
}

// IT-API-SAVED-002: saved list follows the requested locale.
func TestMe_SavedJourneys_Localized(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)
	w, _ := doJSON(t, r, "PUT", "/api/auth/saved/bolivia-salt-flat-trek", token, nil)
	require.Equal(t, http.StatusOK, w.Code)

	w, resp := doJSON(t, r, "GET", "/api/auth/saved?lang=en", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	item := resp["data"].([]interface{})[0].(map[string]interface{})
	assert.Equal(t, "Walking the Mirror of Uyuni", item["title"])
}

// IT-API-SAVED-003: unknown journeys and anonymous callers are rejected.
func TestMe_SavedJourneys_Errors(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)

	w, resp := doJSON(t, r, "PUT", "/api/auth/saved/not-a-journey", token, nil)
	assert.Equal(t, http.StatusNotFound, w.Code)
	assert.Equal(t, "journey not found", resp["error"])

	w, _ = doJSON(t, r, "GET", "/api/auth/saved", "", nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

// IT-API-MBTI-001: the MBTI picked on the profile page is stored on the user.
func TestMe_UpdateMBTI(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)

	w, resp := doJSON(t, r, "PUT", "/api/auth/mbti", token, map[string]string{"mbti_type": "infp"})
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "INFP", resp["data"].(map[string]interface{})["mbti_type"])

	w, resp = doJSON(t, r, "GET", "/api/auth/me", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "INFP", resp["data"].(map[string]interface{})["mbti_type"])

	w, resp = doJSON(t, r, "PUT", "/api/auth/mbti", token, map[string]string{"mbti_type": "ABCD"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Equal(t, "invalid mbti type", resp["error"])
}
