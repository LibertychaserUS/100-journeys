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
	"github.com/100-journeys/app/internal/eventbus"
	"github.com/100-journeys/app/internal/handler"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
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
	aiProvider := ai.NewMockAI()
	engine := ai.NewRecommendEngine(repo)
	captchaStore := service.NewCaptchaStore()
	h := handler.NewJourneyHandler(svc, aiProvider, engine, analyticsBuffer)
	authH := handler.NewAuthHandler(userRepo, captchaStore, filepath.Join(uploadDir, "avatars"))
	adminH := handler.NewAdminHandler(userRepo, repo, adminRepo)
	orderH := handler.NewOrderHandler(orderRepo, repo, userRepo)
	paymentH := handler.NewPaymentHandler(userRepo, txnRepo)
	captchaH := handler.NewCaptchaHandler(captchaStore)
	auditH := handler.NewAuditHandler(db)

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

		// Admin (protected + admin role)
		handler.AdminRoutes(api, adminH)

		// Orders (protected)
		handler.OrderRoutes(api, orderH)

		// Payments (protected)
		handler.PaymentRoutes(api, paymentH)
	}

	// SPA fallback: serve index.html for non-API, non-static routes
	// Inject window.APP_CONFIG into index.html
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}

		indexPath := "./web/index.html"
		content, err := os.ReadFile(indexPath)
		if err != nil {
			c.String(http.StatusInternalServerError, "index.html not found")
			return
		}

		html := string(content)
		configScript := `<script>window.APP_CONFIG = { mediaBase: "` + mediaBase + `", apiBase: "/api" };</script>`
		html = strings.Replace(html, "<!-- App config injected by Go server -->", configScript, 1)
		html = strings.Replace(html, "<!-- window.APP_CONFIG = { mediaBase: \"...\", apiBase: \"/api\" } -->", "", 1)

		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(html))
	})

	log.Printf("Server starting on %s  mediaBase=%s  db=%s\n", bindAddr, mediaBase, dbPath)
	log.Fatal(r.Run(bindAddr))
}
