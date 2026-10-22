package main

import (
	"context"
	"log"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"github.com/100-journeys/app/internal/ai"
	"github.com/100-journeys/app/internal/analytics"
	"github.com/100-journeys/app/internal/compose"
	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/eventbus"
	"github.com/100-journeys/app/internal/handler"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/road"
	"github.com/100-journeys/app/internal/road/light"
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

	// Paper slips of the compose game: the hand-written ones (internal/compose/fragments.json)
	// plus what every entrance hands out at its end (its place and one keepsake per fork option).
	written, err := compose.Load()
	if err != nil {
		log.Fatalf("load compose fragments: %v", err)
	}
	entrances, err := content.Load()
	if err != nil {
		log.Fatalf("load entrances: %v", err)
	}
	fragments := compose.Build(written, entrances)
	if problems := compose.Validate(fragments); len(problems) > 0 {
		log.Fatalf("compose fragments are invalid: %s", strings.Join(problems, "; "))
	}
	// The Ticket Road: printed tags, stamps, flags and report reasons (internal/road/*.json).
	vocab, err := road.LoadVocab()
	if err != nil {
		log.Fatalf("load ticket road vocabulary: %v", err)
	}
	if problems := vocab.Validate(); len(problems) > 0 {
		log.Fatalf("ticket road vocabulary is invalid: %s", strings.Join(problems, "; "))
	}
	catalog := road.NewCatalog(fragments, entrances, vocab, middleware.DeriveKey("ticket-road/author"))
	if problems := catalog.ValidateCurated(); len(problems) > 0 {
		log.Fatalf("the station's own tickets are invalid: %s", strings.Join(problems, "; "))
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
	compositions := repository.NewCompositionRepository(db)
	composeH := handler.NewComposeHandler(compositions, fragments, svc)
	roadH := handler.NewRoadHandler(repository.NewRoadRepository(db), compositions, catalog, light.Defaults())
	nightly, stopNightly := context.WithCancel(context.Background())
	defer stopNightly()
	go roadH.Nightly(nightly, log.Printf)

	// Setup Gin
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	// "//api/health" is /api/health (a base URL with a trailing slash, joined to a path)
	r.RemoveExtraSlash = true

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

		// Compose game: slips and share links (public), kept tickets (protected)
		handler.ComposeRoutes(api, composeH)

		// The Ticket Road: the night station, lamps, racks by the door, rubbings, reports and blocks
		handler.RoadRoutes(api, roadH)

		// Admin (protected + admin role)
		handler.AdminRoutes(api, adminH)

		// Orders (protected)
		handler.OrderRoutes(api, orderH)

		// Payments (protected)
		handler.PaymentRoutes(api, paymentH)
	}

	doors := 0
	if all, err := content.Load(); err == nil {
		doors = len(all)
	}
	assetVersion := os.Getenv("ASSET_VERSION")
	// CSS and JS are served as two bundles built from the files index.html lists (BUNDLE_ASSETS=0
	// serves them one by one, for debugging).
	bundled := os.Getenv("BUNDLE_ASSETS") != "0"
	bundles := &webapp.BundleCache{}
	currentVersion := func() string {
		if assetVersion != "" {
			return assetVersion
		}
		return webapp.AssetVersion("./web")
	}
	shell := func() (string, error) {
		content, err := os.ReadFile("./web/index.html")
		if err != nil {
			return "", err
		}
		version := currentVersion()
		page := string(content)
		if bundled {
			if page, _, err = bundles.Get(page, "./web", version); err != nil {
				return "", err
			}
		}
		return webapp.RenderIndex(page, webapp.Config{APIBase: "/api", MediaBase: mediaBase, AssetVersion: version, Doors: doors}), nil
	}
	serveBundle := func(kind string) gin.HandlerFunc {
		return func(c *gin.Context) {
			content, err := os.ReadFile("./web/index.html")
			if err != nil {
				c.Status(http.StatusInternalServerError)
				return
			}
			_, b, err := bundles.Get(string(content), "./web", currentVersion())
			if err != nil {
				c.Status(http.StatusInternalServerError)
				return
			}
			body, zipped, ctype := b.CSS, b.CSSGz, "text/css; charset=utf-8"
			if kind == "js" {
				body, zipped, ctype = b.JS, b.JSGz, "text/javascript; charset=utf-8"
			}
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
			c.Header("Vary", "Accept-Encoding")
			if webapp.AcceptsGzip(c.GetHeader("Accept-Encoding")) {
				c.Header("Content-Encoding", "gzip")
				c.Data(http.StatusOK, ctype, zipped)
				return
			}
			c.Data(http.StatusOK, ctype, body)
		}
	}
	// Crawlers: a real robots.txt, and a sitemap of every journey's share page (the SPA's hash
	// routes are invisible to them; /j/:slug carries each journey's title, hook and image).
	originOf := func(c *gin.Context) string {
		scheme := "http"
		if c.Request.TLS != nil || c.GetHeader("X-Forwarded-Proto") == "https" {
			scheme = "https"
		}
		return scheme + "://" + c.Request.Host
	}
	// The routes below also answer HEAD (link checkers and unfurlers ask with it first);
	// net/http drops the body.
	get := func(p string, h gin.HandlerFunc) { r.GET(p, h); r.HEAD(p, h) }
	// Browsers and crawlers ask for /favicon.ico whatever the page says: give them the icon.
	get("/favicon.ico", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=86400")
		c.File("./web/assets/icons/favicon-32.png")
	})
	get("/robots.txt", func(c *gin.Context) {
		c.Header("Cache-Control", "public, max-age=3600")
		c.String(http.StatusOK, "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: %s/sitemap.xml\n", originOf(c))
	})
	get("/sitemap.xml", func(c *gin.Context) {
		journeys, _, err := svc.ListJourneys(c.Request.Context(), model.JourneyFilter{Page: 1, Limit: 100})
		if err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
		origin := originOf(c)
		var b strings.Builder
		b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n" + `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
		b.WriteString("  <url><loc>" + origin + "/</loc></url>\n")
		for _, j := range journeys {
			b.WriteString("  <url><loc>" + origin + "/j/" + url.PathEscape(j.Slug) + "</loc><lastmod>" + j.UpdatedAt.UTC().Format("2006-01-02") + "</lastmod></url>\n")
		}
		b.WriteString("</urlset>\n")
		c.Header("Cache-Control", "public, max-age=3600")
		c.Data(http.StatusOK, "application/xml; charset=utf-8", []byte(b.String()))
	})
	get("/bundle/app.css", serveBundle("css"))
	get("/bundle/app.js", serveBundle("js"))

	// Journey share links: the same SPA shell, with the journey's title, hook and cover as
	// Open Graph tags (crawlers don't run JS); the page itself redirects into #/journey/:slug.
	get("/j/:slug", func(c *gin.Context) {
		page, err := shell()
		if err != nil {
			c.String(http.StatusInternalServerError, "index.html not found")
			return
		}
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
				URL: origin + "/j/" + j.Slug, Locale: locale, Preload: webapp.PreloadCover(j.ImageURL),
			})
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
	})

	// SPA fallback: serve index.html for non-API, non-static routes.
	// Injects window.APP_CONFIG and versions CSS/JS links (ASSET_VERSION env pins it; otherwise
	// it is fingerprinted from web/ so edits and deploys bust the immutable /static cache).
	r.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(path.Clean("/"+c.Request.URL.Path), "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"data": nil, "error": "not found"})
			return
		}

		html, err := shell()
		if err != nil {
			c.String(http.StatusInternalServerError, "index.html not found")
			return
		}
		c.Header("Cache-Control", "no-cache")
		// Only the root is a page (the app's own routes live after the #); any other path is a
		// real 404, still in the shell so the reader lands on the app's not-found page.
		if p := path.Clean("/" + c.Request.URL.Path); p != "/" && p != "/index.html" {
			c.Data(http.StatusNotFound, "text/html; charset=utf-8", []byte(webapp.NotFound(html)))
			return
		}
		lang := "zh"
		if service.NormalizeLocale(c.Query("lang")) == "en" {
			lang = "en"
		}
		html = webapp.HomeMeta(html, originOf(c), lang)
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
