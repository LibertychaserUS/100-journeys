package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/100-journeys/app/internal/ai"
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

	mediaBase := os.Getenv("CDN_BASE_URL")
	if mediaBase == "" {
		mediaBase = "/static/assets/images"
	}

	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/app.db"
	}

	// Ensure data directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("create data dir: %v", err)
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

	// Wire dependencies
	repo := repository.NewJourneyRepository(db)
	userRepo := repository.NewUserRepository(db)
	media := &service.LocalProvider{BaseURL: mediaBase}
	svc := service.NewJourneyService(repo, media)
	aiProvider := ai.NewMockAI()
	engine := ai.NewRecommendEngine(repo)
	h := handler.NewJourneyHandler(svc, aiProvider, engine)
	authH := handler.NewAuthHandler(userRepo)

	// Setup Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Middleware stack (order matters)
	r.Use(gin.Recovery())           // P1: panic recovery
	r.Use(middleware.RequestID())   // P1: request tracing
	r.Use(middleware.Logger())      // P1: structured request logging
	r.Use(middleware.CORS())        // P1: whitelist CORS

	// Static files
	r.Static("/static", "./web")

	// API routes
	api := r.Group("/api")
	{
		api.GET("/journeys", h.List)
		api.GET("/journeys/:slug", h.Get)
		api.GET("/journeys/:slug/book", h.GetBookingInfo)
		api.GET("/tags", h.ListTags)
		api.GET("/mbti", h.ListMBTITypes)
		api.POST("/ai/chat", h.AIChat)
		api.GET("/health", h.Health)

		// Auth (public)
		api.POST("/auth/register", authH.Register)
		api.POST("/auth/login", authH.Login)

		// Auth (protected)
		auth := api.Group("/auth")
		auth.Use(middleware.JWTAuth())
		{
			auth.GET("/me", authH.Me)
		}
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

	log.Printf("Server starting on :%s  mediaBase=%s  db=%s\n", port, mediaBase, dbPath)
	log.Fatal(r.Run(":" + port))
}
