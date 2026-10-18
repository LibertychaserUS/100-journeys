package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

func setupTestRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)

	projectRoot, err := filepath.Abs("../..")
	if err != nil {
		t.Fatalf("resolve project root: %v", err)
	}

	db, err := repository.NewDB(":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })

	if err := repository.Migrate(db, filepath.Join(projectRoot, "db/schema.sql")); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := repository.Seed(db, filepath.Join(projectRoot, "db/seed.sql")); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := content.Sync(context.Background(), db); err != nil {
		t.Fatalf("sync content: %v", err)
	}

	repo := repository.NewJourneyRepository(db)
	media := &service.LocalProvider{BaseURL: "http://cdn"}
	svc := service.NewJourneyService(repo, media)
	aiProvider := ai.NewMockAI()
	engine := ai.NewRecommendEngine(repo)
	h := NewJourneyHandler(svc, aiProvider, engine)

	r := gin.New()
	api := r.Group("/api")
	{
		api.GET("/journeys", h.List)
		api.GET("/journeys/:slug", h.Get)
		api.GET("/journeys/:slug/book", h.GetBookingInfo)
		api.GET("/tags", h.ListTags)
		api.GET("/mbti", h.ListMBTITypes)
		api.POST("/ai/chat", h.AIChat)
		api.GET("/health", h.Health)
	}

	return r
}

// IT-API-001: GET /api/journeys
func TestHandler_ListJourneys(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if resp["error"] != nil {
		t.Errorf("expected no error, got %v", resp["error"])
	}
	data, ok := resp["data"].([]interface{})
	if !ok {
		t.Fatal("expected data array")
	}
	if len(data) == 0 {
		t.Error("expected journeys in response")
	}
}

// IT-API-002: GET /api/journeys with filters
func TestHandler_ListJourneys_Filtered(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys?fantasy_type=extreme", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].([]interface{})
	for _, item := range data {
		j := item.(map[string]interface{})
		if j["fantasy_type"] != "extreme" {
			t.Errorf("expected fantasy_type=extreme, got %v", j["fantasy_type"])
		}
	}
}

// IT-API-003: GET /api/journeys/:slug
func TestHandler_GetJourney(t *testing.T) {
	r := setupTestRouter(t)

	// First get a valid slug from list
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys", nil)
	r.ServeHTTP(w, req)

	var listResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &listResp)
	data := listResp["data"].([]interface{})
	if len(data) == 0 {
		t.Fatal("no journeys to test with")
	}
	slug := data[0].(map[string]interface{})["slug"].(string)

	// Now fetch by slug
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/journeys/"+slug, nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	jData := resp["data"].(map[string]interface{})
	if jData["slug"] != slug {
		t.Errorf("expected slug=%s, got %v", slug, jData["slug"])
	}
}

// IT-API-004: GET /api/journeys/:slug 404
func TestHandler_GetJourney_NotFound(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys/nonexistent-slug-xyz", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["error"] == nil {
		t.Error("expected error in response")
	}
}

// IT-API-005: GET /api/tags
func TestHandler_ListTags(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/tags", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].([]interface{})
	if len(data) == 0 {
		t.Error("expected tags in response")
	}
}

// IT-API-006: GET /api/mbti
func TestHandler_ListMBTI(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/mbti", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].([]interface{})
	if len(data) != 16 {
		t.Errorf("expected 16 MBTI types, got %d", len(data))
	}
}

// IT-API-007: POST /api/ai/chat
func TestHandler_AIChat(t *testing.T) {
	r := setupTestRouter(t)

	body, _ := json.Marshal(model.AIChatRequest{Message: "你好", SessionID: "test-session"})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	if data["reply"] == nil || data["reply"].(string) == "" {
		t.Error("expected non-empty reply")
	}
}

// IT-API-008: GET /api/health
func TestHandler_Health(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/health", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	data := resp["data"].(map[string]interface{})
	if data["status"] != "ok" {
		t.Errorf("expected status=ok, got %v", data["status"])
	}
}

// IT-API-009: GET /api/journeys/:slug/book
func TestHandler_GetBookingInfo(t *testing.T) {
	r := setupTestRouter(t)

	// Get a valid slug first
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys", nil)
	r.ServeHTTP(w, req)
	var listResp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &listResp)
	data := listResp["data"].([]interface{})
	if len(data) == 0 {
		t.Fatal("no journeys to test with")
	}
	slug := data[0].(map[string]interface{})["slug"].(string)

	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/journeys/"+slug+"/book", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	bData := resp["data"].(map[string]interface{})
	if bData["journey_slug"] != slug {
		t.Errorf("expected journey_slug=%s, got %v", slug, bData["journey_slug"])
	}
}

// IT-API-010: GET /api/journeys/:slug/book 404
func TestHandler_GetBookingInfo_NotFound(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys/nonexistent/book", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", w.Code)
	}
}

// IT-API-011: GET /api/journeys with invalid query
func TestHandler_ListJourneys_InvalidQuery(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys?page=notanumber", nil)
	r.ServeHTTP(w, req)

	// Gin's ShouldBindQuery will set page=0 for invalid values, which is accepted
	// The test verifies the handler doesn't panic on bad input
	if w.Code != http.StatusOK && w.Code != http.StatusBadRequest {
		t.Fatalf("expected 200 or 400, got %d", w.Code)
	}
}

// IT-API-012: GET /api/journeys with pagination
func TestHandler_ListJourneys_Pagination(t *testing.T) {
	r := setupTestRouter(t)

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/journeys?limit=2&page=1", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["limit"] != float64(2) {
		t.Errorf("expected limit=2, got %v", resp["limit"])
	}
	if resp["page"] != float64(1) {
		t.Errorf("expected page=1, got %v", resp["page"])
	}
}

// IT-API-013: Invalid chat request
func TestHandler_AIChat_Invalid(t *testing.T) {
	r := setupTestRouter(t)

	body, _ := json.Marshal(map[string]string{})
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/ai/chat", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func getLocalizedJSON(t *testing.T, r *gin.Engine, path string) map[string]interface{} {
	t.Helper()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", path, nil)
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET %s: expected 200, got %d (%s)", path, w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	return resp
}

// IT-API-I18N-001: lang=en returns English content for every seeded journey.
func TestHandler_ListJourneys_English(t *testing.T) {
	r := setupTestRouter(t)
	resp := getLocalizedJSON(t, r, "/api/journeys?lang=en&limit=50")
	items := resp["data"].([]interface{})
	if len(items) < 12 {
		t.Fatalf("expected all seeded journeys, got %d", len(items))
	}
	for _, it := range items {
		j := it.(map[string]interface{})
		title := j["title"].(string)
		for _, r := range title {
			if r >= 0x4e00 && r <= 0x9fff {
				t.Errorf("journey %s still has a Chinese title in English mode: %s", j["slug"], title)
				break
			}
		}
		if j["locale"] != "en" {
			t.Errorf("journey %s: expected locale en, got %v", j["slug"], j["locale"])
		}
		if len(j["mood_keywords"].([]interface{})) == 0 {
			t.Errorf("journey %s: expected English mood keywords", j["slug"])
		}
	}
}

// IT-API-I18N-002: default (no lang) keeps the Chinese base content.
func TestHandler_GetJourney_DefaultChinese(t *testing.T) {
	r := setupTestRouter(t)
	resp := getLocalizedJSON(t, r, "/api/journeys/bolivia-salt-flat-trek")
	j := resp["data"].(map[string]interface{})
	if j["title"] != authored(t, "bolivia-salt-flat-trek").ZH.Title {
		t.Errorf("expected Chinese title, got %v", j["title"])
	}
	if j["locale"] != "zh" {
		t.Errorf("expected locale zh, got %v", j["locale"])
	}
}

// IT-API-I18N-003: detail endpoint localizes story and region.
func TestHandler_GetJourney_English(t *testing.T) {
	r := setupTestRouter(t)
	resp := getLocalizedJSON(t, r, "/api/journeys/bolivia-salt-flat-trek?lang=en-US")
	j := resp["data"].(map[string]interface{})
	en := authored(t, "bolivia-salt-flat-trek").EN
	if j["title"] != en.Title {
		t.Errorf("unexpected English title: %v", j["title"])
	}
	if j["region"] != en.Region {
		t.Errorf("unexpected English region: %v", j["region"])
	}
	if story, _ := j["story"].(string); story == "" {
		t.Error("expected an English story")
	}
}

// IT-API-I18N-004: searching in English matches English content.
func TestHandler_SearchJourneys_English(t *testing.T) {
	r := setupTestRouter(t)
	en := authored(t, "norway-aurora-hunt").EN.Title
	resp := getLocalizedJSON(t, r, "/api/journeys?lang=en&limit=50&q=aurora")
	if j := findSlug(resp, "norway-aurora-hunt"); j == nil || j["title"] != en {
		t.Fatalf("expected the aurora journey with its English title %q, got %v", en, resp["data"])
	}
	// Chinese search still works while browsing in English.
	resp = getLocalizedJSON(t, r, "/api/journeys?lang=en&limit=50&q=极光")
	if findSlug(resp, "norway-aurora-hunt") == nil {
		t.Fatalf("expected Chinese query to match in English mode, got %v", resp["data"])
	}
}

func findSlug(resp map[string]interface{}, slug string) map[string]interface{} {
	items, _ := resp["data"].([]interface{})
	for _, it := range items {
		if j := it.(map[string]interface{}); j["slug"] == slug {
			return j
		}
	}
	return nil
}

// IT-API-MEDIA-001: every journey resolves to its own cover image.
func TestHandler_ListJourneys_UniqueCovers(t *testing.T) {
	r := setupTestRouter(t)
	resp := getLocalizedJSON(t, r, "/api/journeys?limit=50")
	seen := map[string]string{}
	for _, it := range resp["data"].([]interface{}) {
		j := it.(map[string]interface{})
		url := j["image_url"].(string)
		if url == "" {
			t.Errorf("journey %s has no cover", j["slug"])
		}
		if other, ok := seen[url]; ok {
			t.Errorf("journeys %s and %s share cover %s", other, j["slug"], url)
		}
		seen[url] = j["slug"].(string)
	}
}

// IT-API-MBTI-ORDER-001: MBTI matches are ordered best match first.
func TestHandler_GetJourney_MBTIOrderedByScore(t *testing.T) {
	r := setupTestRouter(t)
	resp := getLocalizedJSON(t, r, "/api/journeys/bolivia-salt-flat-trek")
	mbti := resp["data"].(map[string]interface{})["mbti_types"].([]interface{})
	last := 6.0
	for _, m := range mbti {
		score := m.(map[string]interface{})["compatibility_score"].(float64)
		if score > last {
			t.Fatalf("mbti matches not sorted by score: %v", mbti)
		}
		last = score
	}
}

// IT-API-CONTENT-001: detail carries the authored entrance and full localized content;
// the list only carries the summary lines.
func TestHandler_AuthoredContent(t *testing.T) {
	r := setupTestRouter(t)
	e := authored(t, "bolivia-salt-flat-trek")

	resp := getLocalizedJSON(t, r, "/api/journeys/bolivia-salt-flat-trek?lang=en")
	j := resp["data"].(map[string]interface{})
	entrance, ok := j["entrance"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected entrance on detail, got %v", j["entrance"])
	}
	if int(entrance["no"].(float64)) != e.Entrance.No || entrance["realm"] != e.Entrance.Realm {
		t.Errorf("unexpected entrance: %v", entrance)
	}
	c, ok := j["content"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected content on detail, got %v", j["content"])
	}
	if c["locale"] != "en" || c["role"] != e.EN.Role {
		t.Errorf("unexpected content locale/role: %v / %v", c["locale"], c["role"])
	}
	if chapters, _ := c["chapters"].([]interface{}); len(chapters) != len(e.EN.Chapters) {
		t.Errorf("expected %d chapters, got %d", len(e.EN.Chapters), len(chapters))
	}
	if facts, _ := c["facts"].([]interface{}); len(facts) == 0 {
		t.Error("expected sourced facts on detail")
	}

	all, err := content.Load()
	if err != nil {
		t.Fatalf("load content: %v", err)
	}
	opens := map[string]string{}
	for _, a := range all {
		opens[a.Slug] = a.ZH.Opens
	}
	resp = getLocalizedJSON(t, r, "/api/journeys?limit=50")
	for _, it := range resp["data"].([]interface{}) {
		item := it.(map[string]interface{})
		want, isAuthored := opens[item["slug"].(string)]
		if !isAuthored {
			if item["content"] != nil {
				t.Errorf("unauthored journey %v should not carry content", item["slug"])
			}
			continue
		}
		c := item["content"].(map[string]interface{})
		if c["opens"] != want || c["chapters"] != nil {
			t.Errorf("list should only carry the zh summary for %v, got %v", item["slug"], c)
		}
	}
}

// authored returns the authored entrance for slug, so assertions follow the content files.
func authored(t *testing.T, slug string) content.Entrance {
	t.Helper()
	all, err := content.Load()
	if err != nil {
		t.Fatalf("load content: %v", err)
	}
	for _, e := range all {
		if e.Slug == slug {
			return e
		}
	}
	t.Fatalf("no authored entrance %q", slug)
	return content.Entrance{}
}
