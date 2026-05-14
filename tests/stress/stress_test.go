//go:build stress

package stress

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/analytics"
	"github.com/100-journeys/app/internal/handler"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
)

func TestStressPublicBrowseFlow(t *testing.T) {
	app := newStressApp(t)
	defer app.close()

	requests := stressInt("STRESS_PUBLIC_REQUESTS", 300)
	parallel(t, requests, func(i int) {
		endpoints := []string{
			"/api/health",
			"/api/tags",
			"/api/mbti",
			"/api/journeys?limit=12",
			"/api/journeys?q=%E9%93%B6%E6%B2%B3&limit=12",
			"/api/journeys/bolivia-salt-flat-trek",
		}
		resp, err := http.Get(app.url + endpoints[i%len(endpoints)])
		if err != nil {
			t.Errorf("public request failed: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("unexpected status %d for %s", resp.StatusCode, endpoints[i%len(endpoints)])
		}
	})
}

func TestStressAnalyticsBufferCapacity(t *testing.T) {
	app := newStressApp(t)
	defer app.close()

	events := stressInt("STRESS_ANALYTICS_EVENTS", 20000)
	parallel(t, events, func(i int) {
		ok := app.analytics.Track(analytics.Event{
			Type:        analytics.EventJourneyClick,
			JourneySlug: "bolivia-salt-flat-trek",
			MBTIType:    "INFP",
		})
		if !ok {
			t.Errorf("analytics event dropped at %d", i)
		}
	})
	if err := app.analytics.Flush(context.Background()); err != nil {
		t.Fatalf("flush analytics: %v", err)
	}
	var total int
	if err := app.db.QueryRow(`SELECT COUNT(*) FROM analytics_events WHERE event_type = 'journey_click'`).Scan(&total); err != nil {
		t.Fatalf("count analytics: %v", err)
	}
	if total < events {
		t.Fatalf("expected at least %d analytics events, got %d", events, total)
	}
}

func TestStressOrderPaymentAuditTrail(t *testing.T) {
	app := newStressApp(t)
	defer app.close()

	users := stressInt("STRESS_USERS", 100)
	orders := stressInt("STRESS_ORDERS", 500)
	journey := firstJourney(t, app.db)
	ctx := context.Background()

	userIDs := make([]int64, 0, users)
	for i := 0; i < users; i++ {
		u := &model.User{
			Username:     "stress-user",
			Email:        fmt.Sprintf("stress-%d@example.com", i),
			PasswordHash: "hashed",
			Role:         model.RoleUser,
			Level:        1,
			Balance:      1000000,
			Gender:       "prefer_not_to_say",
		}
		if err := app.userRepo.Create(ctx, u); err != nil {
			t.Fatalf("create user: %v", err)
		}
		userIDs = append(userIDs, u.ID)
	}

	var failures atomic.Int64
	parallel(t, orders, func(i int) {
		userID := userIDs[i%len(userIDs)]
		order, err := app.orderRepo.Create(ctx, userID, []model.OrderItem{{
			JourneyID:    journey.ID,
			JourneyTitle: journey.Title,
			UnitPrice:    100,
			Quantity:     1,
		}})
		if err != nil {
			failures.Add(1)
			t.Errorf("create order: %v", err)
			return
		}
		if err := app.orderRepo.Pay(ctx, order.ID, userID); err != nil {
			failures.Add(1)
			t.Errorf("pay order: %v", err)
		}
	})
	if failures.Load() > 0 {
		t.Fatalf("order stress failures: %d", failures.Load())
	}

	var paid, txns int
	if err := app.db.QueryRow(`SELECT COUNT(*) FROM orders WHERE status = 'paid'`).Scan(&paid); err != nil {
		t.Fatal(err)
	}
	if err := app.db.QueryRow(`SELECT COUNT(*) FROM transactions WHERE txn_type = 'purchase'`).Scan(&txns); err != nil {
		t.Fatal(err)
	}
	if paid != orders || txns != orders {
		t.Fatalf("audit mismatch: paid=%d txns=%d expected=%d", paid, txns, orders)
	}
}

func TestStressAdminStatsAndExportAPI(t *testing.T) {
	app := newStressApp(t)
	defer app.close()

	for i := 0; i < 200; i++ {
		app.analytics.Track(analytics.Event{Type: analytics.EventJourneyClick, JourneySlug: "bolivia-salt-flat-trek", MBTIType: "INFP"})
	}
	if err := app.analytics.Flush(context.Background()); err != nil {
		t.Fatal(err)
	}
	admin := createAdmin(t, app.userRepo)
	token, err := middleware.GenerateToken(admin)
	if err != nil {
		t.Fatal(err)
	}

	parallel(t, stressInt("STRESS_ADMIN_REQUESTS", 100), func(i int) {
		req, _ := http.NewRequest(http.MethodGet, app.url+"/api/admin/stats", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Errorf("admin stats: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("admin status=%d", resp.StatusCode)
		}
	})

	req, _ := http.NewRequest(http.MethodGet, app.url+"/api/admin/export?format=csv", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("export status=%d", resp.StatusCode)
	}
}

func TestStressStaticImageDelivery(t *testing.T) {
	app := newStressApp(t)
	defer app.close()

	paths := []string{
		"/static/assets/images/generated/hero-taoyuan.jpg",
		"/static/assets/images/generated/card-salt-mirror.jpg",
		"/static/assets/images/generated/card-lava-tunnel.jpg",
		"/static/assets/images/generated/card-temple-onsen.jpg",
		"/static/assets/images/generated/card-sahara-stars.jpg",
	}
	parallel(t, stressInt("STRESS_IMAGE_REQUESTS", 300), func(i int) {
		resp, err := http.Get(app.url + paths[i%len(paths)])
		if err != nil {
			t.Errorf("image request: %v", err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			t.Errorf("image status=%d", resp.StatusCode)
		}
		if resp.Header.Get("Cache-Control") == "" {
			t.Errorf("missing cache header")
		}
	})
}

type stressApp struct {
	db        *sql.DB
	url       string
	server    *httptest.Server
	userRepo  repository.UserRepository
	orderRepo repository.OrderRepository
	analytics *analytics.Buffer
}

func newStressApp(t *testing.T) *stressApp {
	t.Helper()
	gin.SetMode(gin.TestMode)

	root, err := filepath.Abs("../..")
	if err != nil {
		t.Fatal(err)
	}
	db, err := repository.NewDB(filepath.Join(t.TempDir(), "stress.db"))
	if err != nil {
		t.Fatal(err)
	}
	if err := repository.Migrate(db, filepath.Join(root, "db/schema.sql")); err != nil {
		t.Fatal(err)
	}
	if err := repository.Seed(db, filepath.Join(root, "db/seed.sql")); err != nil {
		t.Fatal(err)
	}

	journeyRepo := repository.NewJourneyRepository(db)
	userRepo := repository.NewUserRepository(db)
	orderRepo := repository.NewOrderRepository(db)
	txnRepo := repository.NewTransactionRepository(db)
	adminRepo := repository.NewAdminRepository(db)
	eventOptions := analytics.DefaultOptions()
	eventOptions.FlushInterval = 0
	events := analytics.NewBuffer(db, eventOptions)
	svc := service.NewJourneyService(journeyRepo, &service.LocalProvider{BaseURL: "/static/assets/images"})
	captcha := service.NewCaptchaStore()

	h := handler.NewJourneyHandler(svc, ai.NewMockAI(), ai.NewRecommendEngine(journeyRepo), events)
	authH := handler.NewAuthHandler(userRepo, captcha, filepath.Join(t.TempDir(), "avatars"))
	adminH := handler.NewAdminHandler(userRepo, journeyRepo, adminRepo)
	orderH := handler.NewOrderHandler(orderRepo, journeyRepo, userRepo)
	paymentH := handler.NewPaymentHandler(userRepo, txnRepo)
	captchaH := handler.NewCaptchaHandler(captcha)

	r := gin.New()
	r.Use(gin.Recovery())
	static := r.Group("/static")
	static.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Next()
	})
	static.StaticFS("/", http.Dir(filepath.Join(root, "web")))
	api := r.Group("/api")
	api.GET("/health", h.Health)
	api.GET("/journeys", h.List)
	api.GET("/journeys/:slug", h.Get)
	api.GET("/tags", h.ListTags)
	api.GET("/mbti", h.ListMBTITypes)
	api.POST("/ai/chat", h.AIChat)
	api.POST("/analytics/events", h.TrackAnalytics)
	api.GET("/captcha", captchaH.Generate)
	api.POST("/auth/register", authH.Register)
	api.POST("/auth/login", authH.Login)
	auth := api.Group("/auth")
	auth.Use(middleware.JWTAuth())
	auth.GET("/me", authH.Me)
	auth.POST("/avatar", authH.UploadAvatar)
	handler.AdminRoutes(api, adminH)
	handler.OrderRoutes(api, orderH)
	handler.PaymentRoutes(api, paymentH)

	server := httptest.NewServer(r)
	return &stressApp{db: db, url: server.URL, server: server, userRepo: userRepo, orderRepo: orderRepo, analytics: events}
}

func (a *stressApp) close() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = a.analytics.Close(ctx)
	a.server.Close()
	_ = a.db.Close()
}

func parallel(t *testing.T, count int, fn func(int)) {
	t.Helper()
	var wg sync.WaitGroup
	wg.Add(count)
	for i := 0; i < count; i++ {
		i := i
		go func() {
			defer wg.Done()
			fn(i)
		}()
	}
	wg.Wait()
}

func stressInt(name string, fallback int) int {
	if raw := getenv(name); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			return v
		}
	}
	return fallback
}

func getenv(name string) string {
	return os.Getenv(name)
}

func firstJourney(t *testing.T, db *sql.DB) model.Journey {
	t.Helper()
	repo := repository.NewJourneyRepository(db)
	journeys, _, err := repo.List(context.Background(), model.JourneyFilter{Limit: 1, Page: 1})
	if err != nil || len(journeys) == 0 {
		t.Fatalf("first journey: %v", err)
	}
	return journeys[0]
}

func createAdmin(t *testing.T, repo repository.UserRepository) *model.User {
	t.Helper()
	admin := &model.User{
		Username:     "admin",
		Email:        "admin@example.com",
		PasswordHash: "hashed",
		Role:         model.RoleAdmin,
		Level:        1,
		Gender:       "prefer_not_to_say",
	}
	if err := repo.Create(context.Background(), admin); err != nil {
		t.Fatal(err)
	}
	return admin
}

func _jsonBody(v interface{}) *bytes.Reader {
	b, _ := json.Marshal(v)
	return bytes.NewReader(b)
}
