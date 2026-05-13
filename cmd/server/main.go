package main

import (
	"log"
	"net/http"
	"os"

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

	r := gin.Default()

	// Inject APP_CONFIG into index.html via middleware
	r.Use(func(c *gin.Context) {
		c.Set("mediaBase", mediaBase)
		c.Next()
	})

	// Static files
	r.Static("/static", "./web")

	// SPA: serve index.html for all non-API routes
	r.NoRoute(func(c *gin.Context) {
		if len(c.Request.URL.Path) >= 4 && c.Request.URL.Path[:4] == "/api" {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File("./web/index.html")
	})

	// API routes — handlers wired up in SDD phase
	api := r.Group("/api")
	{
		api.GET("/journeys",      placeholder("journeys list"))
		api.GET("/journeys/:slug", placeholder("journey detail"))
		api.GET("/tags",          placeholder("tags list"))
		api.GET("/health",        health)
	}

	log.Printf("Server starting on :%s  mediaBase=%s\n", port, mediaBase)
	log.Fatal(r.Run(":" + port))
}

func placeholder(name string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "placeholder", "endpoint": name})
	}
}

func health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}
