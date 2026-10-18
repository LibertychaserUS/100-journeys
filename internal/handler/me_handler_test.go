package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/content"
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
	require.NoError(t, content.Sync(context.Background(), db))

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
	assert.Equal(t, authored(t, "bolivia-salt-flat-trek").EN.Title, item["title"])
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

// IT-API-CHOICE-001: fork picks are validated against the authored options and stored per account.
func TestMe_Choices(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)
	e := authored(t, "bolivia-salt-flat-trek")
	key := e.ZH.Choice.Options[1].Key

	w, resp := doJSON(t, r, "GET", "/api/auth/choices", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, resp["data"])

	w, _ = doJSON(t, r, "PUT", "/api/auth/choices/bolivia-salt-flat-trek", token, map[string]string{"key": key})
	require.Equal(t, http.StatusOK, w.Code)
	w, _ = doJSON(t, r, "PUT", "/api/auth/choices/bolivia-salt-flat-trek", token, map[string]string{"key": "not-an-option"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
	w, _ = doJSON(t, r, "PUT", "/api/auth/choices/no-such-journey", token, map[string]string{"key": key})
	assert.Equal(t, http.StatusNotFound, w.Code)
	w, _ = doJSON(t, r, "PUT", "/api/auth/choices/bolivia-salt-flat-trek", "", map[string]string{"key": key})
	assert.Equal(t, http.StatusUnauthorized, w.Code)

	w, resp = doJSON(t, r, "GET", "/api/auth/choices", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, map[string]interface{}{"bolivia-salt-flat-trek": key}, resp["data"])
}

// IT-API-MERGE-001: guest state merges into the account once, idempotently, skipping what doesn't exist.
func TestMe_MergeGuest(t *testing.T) {
	r, captcha := setupMeTestRouter(t)
	token := registerAndGetToken(t, r, captcha)
	key := authored(t, "bolivia-salt-flat-trek").ZH.Choice.Options[0].Key
	body := map[string]interface{}{
		"mbti_type": "infp",
		"choices":   map[string]string{"bolivia-salt-flat-trek": key, "no-such-journey": "x", "norway-aurora-hunt": "x"},
	}
	for i := 0; i < 2; i++ {
		w, resp := doJSON(t, r, "POST", "/api/auth/guest/merge", token, body)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		data := resp["data"].(map[string]interface{})
		assert.Equal(t, "INFP", data["mbti_type"])
		assert.Equal(t, map[string]interface{}{"bolivia-salt-flat-trek": key}, data["choices"])
		assert.ElementsMatch(t, []interface{}{"no-such-journey", "norway-aurora-hunt"}, data["skipped"])
	}
	w, resp := doJSON(t, r, "GET", "/api/auth/me", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "INFP", resp["data"].(map[string]interface{})["mbti_type"])

	// Empty guest state keeps the account's type.
	w, resp = doJSON(t, r, "POST", "/api/auth/guest/merge", token, map[string]interface{}{})
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "INFP", resp["data"].(map[string]interface{})["mbti_type"])

	w, _ = doJSON(t, r, "POST", "/api/auth/guest/merge", token, map[string]interface{}{"mbti_type": "ABCD"})
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
