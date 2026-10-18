package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	_ "modernc.org/sqlite"
)

func setupComposeTestRouter(t *testing.T) (*gin.Engine, *service.CaptchaStore) {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, _ := filepath.Abs("../..")
	db, err := repository.NewDB(":memory:")
	require.NoError(t, err)
	t.Cleanup(func() { db.Close() })
	require.NoError(t, repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")))
	require.NoError(t, repository.Seed(db, filepath.Join(projectRoot, "db/seed.sql")))
	require.NoError(t, content.Sync(context.Background(), db))

	fragments, err := compose.Load()
	require.NoError(t, err)
	userRepo := repository.NewUserRepository(db)
	svc := service.NewJourneyService(repository.NewJourneyRepository(db), &service.LocalProvider{BaseURL: "/static/assets/images"})
	captchaStore := service.NewCaptchaStore()
	authH := NewAuthHandler(userRepo, captchaStore, filepath.Join(t.TempDir(), "avatars"))

	r := gin.New()
	api := r.Group("/api")
	api.POST("/auth/register", authH.Register)
	ComposeRoutes(api, NewComposeHandler(repository.NewCompositionRepository(db), fragments, svc))
	return r, captchaStore
}

func registerComposer(t *testing.T, r *gin.Engine, captchaStore *service.CaptchaStore, name string) string {
	t.Helper()
	cid, _, ans := captchaStore.Generate()
	body, _ := json.Marshal(model.RegisterRequest{Username: name, Email: name + "@example.com", Password: "password123", Gender: "prefer_not_to_say", CaptchaID: cid, CaptchaAnswer: ans})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	var res map[string]interface{}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &res))
	return res["data"].(map[string]interface{})["token"].(string)
}

func ticket(id string, picks map[string]string) map[string]interface{} {
	return map[string]interface{}{"id": id, "picks": picks}
}

// IT-API-COMPOSE-001: fragments are public, localized, in group order, and places link to their entrance cover.
func TestCompose_Fragments(t *testing.T) {
	r, _ := setupComposeTestRouter(t)

	w, resp := doJSON(t, r, "GET", "/api/compose/fragments", "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Nil(t, resp["error"])
	list := resp["data"].([]interface{})
	all, _ := compose.Load()
	require.Len(t, list, len(all))
	groups := []string{}
	byKey := map[string]map[string]interface{}{}
	for _, item := range list {
		f := item.(map[string]interface{})
		if len(groups) == 0 || groups[len(groups)-1] != f["group"] {
			groups = append(groups, f["group"].(string))
		}
		byKey[f["group"].(string)+":"+f["key"].(string)] = f
		assert.NotEmpty(t, f["phrase"], "every slip has a sentence phrase")
	}
	assert.Equal(t, compose.Groups, groups, "slips come grouped in tray order")
	uyuni := byKey["place:uyuni"]
	assert.Equal(t, "乌尤尼盐沼", uyuni["text"])
	assert.Equal(t, "bolivia-salt-flat-trek", uyuni["slug"])
	assert.Equal(t, "/static/assets/images/"+authored(t, "bolivia-salt-flat-trek").Cover.Path, uyuni["image_url"])
	assert.Nil(t, byKey["place:back-alley"]["image_url"], "imagined places have no cover")

	w, resp = doJSON(t, r, "GET", "/api/compose/fragments?lang=en", "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	first := resp["data"].([]interface{})[0].(map[string]interface{})
	assert.Equal(t, "Salar de Uyuni", first["text"])
	assert.Equal(t, "Uyuni", first["phrase"])
}

// IT-API-COMPOSE-002: keeping is idempotent on the client id: replays and later edits update the same ticket.
func TestCompose_KeepIsIdempotent(t *testing.T) {
	r, captcha := setupComposeTestRouter(t)
	token := registerComposer(t, r, captcha, "composer")

	body := ticket("4b1d0c4e-3a52-4c0e-9f6a-2f7d1e0c9a11", map[string]string{"place": "uyuni", "hour": "predawn"})
	body["created_at"] = "2026-10-01T08:30:00Z"
	w, resp := doJSON(t, r, "POST", "/api/auth/compositions", token, body)
	require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
	kept := resp["data"].(map[string]interface{})
	code := kept["code"].(string)
	assert.Regexp(t, `^[a-z0-9]{12}$`, code)
	assert.Equal(t, "2026-10-01T08:30:00Z", kept["created_at"], "a guest's keep time survives the replay")

	// The same ticket replayed after sign-in: nothing new is created.
	w, resp = doJSON(t, r, "POST", "/api/auth/compositions", token, body)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, code, resp["data"].(map[string]interface{})["code"])

	// Filled in later: same id, same code, more lines.
	body["picks"] = map[string]string{"place": "uyuni", "hour": "predawn", "season": "rainy", "keepsake": "salt"}
	w, resp = doJSON(t, r, "POST", "/api/auth/compositions", token, body)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "rainy", resp["data"].(map[string]interface{})["picks"].(map[string]interface{})["season"])

	w, resp = doJSON(t, r, "GET", "/api/auth/compositions", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	list := resp["data"].([]interface{})
	require.Len(t, list, 1)
	item := list[0].(map[string]interface{})
	assert.Equal(t, code, item["code"])
	assert.Equal(t, map[string]interface{}{"place": "uyuni", "hour": "predawn", "season": "rainy", "keepsake": "salt"}, item["picks"])
}

// IT-API-COMPOSE-003: share links are public and read-only; they never expose the owner's ticket id.
func TestCompose_SharedView(t *testing.T) {
	r, captcha := setupComposeTestRouter(t)
	token := registerComposer(t, r, captcha, "sharer")
	w, resp := doJSON(t, r, "POST", "/api/auth/compositions", token, ticket("share-ticket-0001", map[string]string{"place": "tromso", "season": "polar-night"}))
	require.Equal(t, http.StatusCreated, w.Code)
	code := resp["data"].(map[string]interface{})["code"].(string)

	w, resp = doJSON(t, r, "GET", "/api/compositions/"+code, "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	shared := resp["data"].(map[string]interface{})
	assert.Equal(t, code, shared["code"])
	assert.Equal(t, "tromso", shared["picks"].(map[string]interface{})["place"])
	assert.NotContains(t, shared, "id")
	assert.NotContains(t, shared, "user_id")

	for _, path := range []string{"/api/compositions/zzzzzzzzzzzz", "/api/compositions/NOT-A-CODE", "/api/compositions/" + code + "x"} {
		w, resp = doJSON(t, r, "GET", path, "", nil)
		assert.Equal(t, http.StatusNotFound, w.Code, path)
		assert.Equal(t, "composition not found", resp["error"])
	}
}

// IT-API-COMPOSE-004: invalid tickets and anonymous callers are rejected with the error envelope.
func TestCompose_Validation(t *testing.T) {
	r, captcha := setupComposeTestRouter(t)
	token := registerComposer(t, r, captcha, "validator")

	cases := []struct {
		name string
		body interface{}
		want string
	}{
		{"empty ticket", ticket("empty-ticket-01", map[string]string{}), "composition needs at least one slip"},
		{"unknown slip", ticket("unknown-slip-01", map[string]string{"hour": "teatime"}), "unknown slip hour:teatime"},
		{"slip in the wrong group", ticket("wrong-group-001", map[string]string{"place": "predawn"}), "unknown slip place:predawn"},
		{"bad id", ticket("x", map[string]string{"place": "uyuni"}), "invalid composition id"},
		{"injection id", ticket("1'; DROP TABLE compositions;--", map[string]string{"place": "uyuni"}), "invalid composition id"},
		{"not json", "nope", "invalid composition"},
	}
	for _, c := range cases {
		w, resp := doJSON(t, r, "POST", "/api/auth/compositions", token, c.body)
		assert.Equal(t, http.StatusBadRequest, w.Code, c.name)
		assert.Equal(t, c.want, resp["error"], c.name)
	}

	w, resp := doJSON(t, r, "GET", "/api/auth/compositions", token, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, resp["data"], "nothing invalid was stored")
	assert.NotNil(t, resp["data"], "an empty list is [], not null")

	for _, method := range []string{"GET", "POST"} {
		w, _ = doJSON(t, r, method, "/api/auth/compositions", "", ticket("anonymous-0001", map[string]string{"place": "uyuni"}))
		assert.Equal(t, http.StatusUnauthorized, w.Code, method)
	}
}

// IT-API-COMPOSE-005: tickets belong to their owner: no overwriting, deleting or listing someone else's.
func TestCompose_Ownership(t *testing.T) {
	r, captcha := setupComposeTestRouter(t)
	alice := registerComposer(t, r, captcha, "alice")
	bob := registerComposer(t, r, captcha, "bob")

	w, resp := doJSON(t, r, "POST", "/api/auth/compositions", alice, ticket("alice-ticket-01", map[string]string{"place": "koyasan"}))
	require.Equal(t, http.StatusCreated, w.Code)
	code := resp["data"].(map[string]interface{})["code"].(string)

	w, resp = doJSON(t, r, "POST", "/api/auth/compositions", bob, ticket("alice-ticket-01", map[string]string{"place": "merzouga"}))
	assert.Equal(t, http.StatusConflict, w.Code)
	assert.Equal(t, "composition id already used", resp["error"])

	w, _ = doJSON(t, r, "DELETE", "/api/auth/compositions/alice-ticket-01", bob, nil)
	assert.Equal(t, http.StatusNotFound, w.Code)
	w, resp = doJSON(t, r, "GET", "/api/auth/compositions", bob, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Empty(t, resp["data"])

	w, resp = doJSON(t, r, "GET", "/api/compositions/"+code, "", nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "koyasan", resp["data"].(map[string]interface{})["picks"].(map[string]interface{})["place"], "bob's attempt changed nothing")

	w, resp = doJSON(t, r, "DELETE", "/api/auth/compositions/alice-ticket-01", alice, nil)
	require.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, true, resp["data"].(map[string]interface{})["deleted"])
	w, _ = doJSON(t, r, "GET", "/api/compositions/"+code, "", nil)
	assert.Equal(t, http.StatusNotFound, w.Code, "a torn-up ticket's link stops working")
}
