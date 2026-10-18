package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/analytics"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/eventbus"
	"github.com/100-journeys/app/internal/handler"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/100-journeys/app/internal/webapp"
	"github.com/gin-gonic/gin"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	bindAddr := os.Getenv("BIND_ADDR")
	if bindAddr == "" {
		bindAddr = ":" + port
	}

	mediaBase := os.Getenv("CDN_BASE_URL")
	if mediaBase == "" {
		mediaBase = "/static/assets/images"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/app.db"
	}
	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "./data/uploads"
	}

	// Ensure data directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(uploadDir, "avatars"), 0755); err != nil {
		log.Fatalf("create upload dir: %v", err)
	}

	// Initialize DB
	db, err := repository.NewDB(dbPath)
	if err != nil {
		log.Fatalf("init db: %v", err)
	}
	defer db.Close()

	if err := repository.Migrate(db, "db/schema.sql"); err != nil {
		log.Fatalf("migrate db: %v", err)
	}
	if err := repository.Seed(db, "db/seed.sql"); err != nil {
		log.Fatalf("seed db: %v", err)
	}
	// Authored journeys (internal/content/entrances/*.json) override the seed rows they describe.
	if err := content.Sync(context.Background(), db); err != nil {
		log.Fatalf("sync content: %v", err)
	}

	// Event bus subscribers
	eventbus.Default.Subscribe(eventbus.UserRegistered, func(evt eventbus.Event) {
		log.Printf("[Event] user registered: uid=%v username=%s", evt.Data["user_id"], evt.Data["username"])
	})
	eventbus.Default.Subscribe(eventbus.OrderPaid, func(evt eventbus.Event) {
		log.Printf("[Event] order paid: oid=%v uid=%v amount=%v", evt.Data["order_id"], evt.Data["user_id"], evt.Data["total_amount"])
	})

	// Wire dependencies
	repo := repository.NewJourneyRepository(db)
	userRepo := repository.NewUserRepository(db)
	adminRepo := repository.NewAdminRepository(db)
	orderRepo := repository.NewOrderRepository(db)
	txnRepo := repository.NewTransactionRepository(db)
	analyticsBuffer := analytics.NewBuffer(db, analytics.DefaultOptions())
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		if err := analyticsBuffer.Close(ctx); err != nil {
			log.Printf("analytics buffer close: %v", err)
		}
	}()
	media := &service.LocalProvider{BaseURL: mediaBase}
	svc := service.NewJourneyService(repo, media)
	var aiProvider ai.Provider = ai.NewMockAI()
	// The DeepSeek guide is used when a key is present (injected from Secrets Manager in
	// production); every failure falls back to the rule-based guide, so the demo never breaks.
	if key := os.Getenv("DEEPSEEK_API_KEY"); key != "" {
		aiProvider = ai.NewDeepSeek(ai.DeepSeekConfig{
			APIKey:  key,
			BaseURL: os.Getenv("DEEPSEEK_BASE_URL"),
			Model:   os.Getenv("DEEPSEEK_MODEL"),
		}, journeyCatalog(svc), ai.NewMockAI())
		log.Printf("ai: DeepSeek guide enabled")
	}
	engine := ai.NewRecommendEngine(repo)
	captchaStore := service.NewCaptchaStore()
	h := handler.NewJourneyHandler(svc, aiProvider, engine, analyticsBuffer)
	authH := handler.NewAuthHandler(userRepo, captchaStore, filepath.Join(uploadDir, "avatars"))
	adminH := handler.NewAdminHandler(userRepo, repo, adminRepo)
	orderH := handler.NewOrderHandler(orderRepo, repo, userRepo)
	paymentH := handler.NewPaymentHandler(userRepo, txnRepo)
	captchaH := handler.NewCaptchaHandler(captchaStore)
	auditH := handler.NewAuditHandler(db)
	meH := handler.NewMeHandler(userRepo, svc)

	// Setup Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Middleware stack (order matters)
	r.Use(middleware.RequestID())       // P1: request tracing
	r.Use(middleware.AuditRecovery(db)) // P1: persistent panic audit
	r.Use(middleware.Logger())          // P1: structured terminal request logging
	r.Use(middleware.AuditLogger(db))   // P1: persistent API audit logs
	r.Use(middleware.CORS())            // P1: whitelist CORS

	// Static files: long-lived local media/CSS/JS caching for faster repeat views.
	static := r.Group("/static")
	static.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Next()
	})
	static.StaticFS("/", http.Dir("./web"))
	uploads := r.Group("/uploads")
	uploads.Use(func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=86400")
		c.Next()
	})
	uploads.StaticFS("/", http.Dir(uploadDir))

	// API routes
	api := r.Group("/api")
	{
		api.GET("/journeys", h.List)
		api.GET("/journeys/:slug", h.Get)
		api.GET("/journeys/:slug/book", h.GetBookingInfo)
		api.GET("/tags", h.ListTags)
		api.GET("/mbti", h.ListMBTITypes)
		api.POST("/ai/chat", h.AIChat)
		api.POST("/analytics/events", h.TrackAnalytics)
		api.POST("/audit/client-error", auditH.ClientError)
		api.GET("/health", h.Health)

		// Captcha (public)
		api.GET("/captcha", captchaH.Generate)

		// Auth (public)
		api.POST("/auth/register", authH.Register)
		api.POST("/auth/login", authH.Login)

		// Auth (protected)
		auth := api.Group("/auth")
		auth.Use(middleware.JWTAuth())
		{
			auth.GET("/me", authH.Me)
			auth.POST("/avatar", authH.UploadAvatar)
		}

		// Saved journeys + travel personality (protected)
		handler.MeRoutes(api, meH)

		// Admin (protected + admin role)
		handler.AdminRoutes(api, adminH)

		// Orders (protected)
		handler.OrderRoutes(api, orderH)

		// Payments (protected)
		handler.PaymentRoutes(api, paymentH)
	}

	assetVersion := os.Getenv("ASSET_VERSION")

	// Journey share links: the same SPA shell, with the journey's title, hook and cover as
	// Open Graph tags (crawlers don't run JS); the page itself redirects into #/journey/:slug.
	r.GET("/j/:slug", func(c *gin.Context) {
		content, err := os.ReadFile("./web/index.html")
		if err != nil {
			c.String(http.StatusInternalServerError, "index.html not found")
			return
		}
		version := assetVersion
		if version == "" {
			version = webapp.AssetVersion("./web")
		}
		page := webapp.RenderIndex(string(content), webapp.Config{APIBase: "/api", MediaBase: mediaBase, AssetVersion: version})
		lang := service.NormalizeLocale(c.Query("lang"))
		j, err := svc.GetJourneyLocalized(c.Request.Context(), c.Param("slug"), lang)
		if err == nil && j != nil {
			scheme := "http"
			if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
				scheme = "https"
			}
			origin := scheme + "://" + c.Request.Host
			image := j.ImageURL
			if j.Scene != nil && j.Scene.Images.Hero != "" {
				image = j.Scene.Images.Hero
			}
			if strings.HasPrefix(image, "/") {
				image = origin + image
			}
			locale, brand := "zh_CN", "桃源百旅"
			if lang == "en" {
				locale, brand = "en_US", "100 Journeys"
			}
			page = webapp.RenderShare(page, webapp.ShareMeta{
				Title: j.Title + " · " + brand, Description: j.StoryHook, Image: image,
				URL: origin + "/j/" + j.Slug, Locale: locale,
			})
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
	})

	// SPA fallback: serve index.html for non-API, non-static routes.
	// Injects window.APP_CONFIG and versions CSS/JS links (ASSET_VERSION env pins it; otherwise
	// it is fingerprinted from web/ so edits and deploys bust the immutable /static cache).
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"data": nil, "error": "not found"})
			return
		}

		indexPath := "./web/index.html"
		content, err := os.ReadFile(indexPath)
		if err != nil {
			c.String(http.StatusInternalServerError, "index.html not found")
			return
		}

		version := assetVersion
		if version == "" {
			version = webapp.AssetVersion("./web")
		}
		html := webapp.RenderIndex(string(content), webapp.Config{APIBase: "/api", MediaBase: mediaBase, AssetVersion: version})

		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
	})

	log.Printf("Server starting on %s  mediaBase=%s  db=%s\n", bindAddr, mediaBase, dbPath)
	log.Fatal(r.Run(bindAddr))
}

// journeyCatalog lists journeys for the guide in the reader's language, with their best types.
func journeyCatalog(svc *service.JourneyService) ai.CatalogFunc {
	return func(ctx context.Context, lang string) ([]ai.CatalogEntry, error) {
		journeys, _, err := svc.ListJourneys(ctx, model.JourneyFilter{Page: 1, Limit: 100, Locale: lang})
		if err != nil {
			return nil, err
		}
		out := make([]ai.CatalogEntry, 0, len(journeys))
		for _, j := range journeys {
			e := ai.CatalogEntry{Slug: j.Slug, Title: j.Title, Hook: j.StoryHook, Region: j.Region, Moods: j.MoodKeywords}
			for _, m := range j.MBTITypes {
				if m.CompatibilityScore >= 4 {
					e.Types = append(e.Types, m.MBTIType.Code)
				}
			}
			out = append(out, e)
		}
		return out, nil
	}
}
