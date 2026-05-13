package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
)

type AdminHandler struct {
	userRepo    repository.UserRepository
	journeyRepo repository.JourneyRepository
	adminRepo   repository.AdminRepository
}

func NewAdminHandler(userRepo repository.UserRepository, journeyRepo repository.JourneyRepository, adminRepo repository.AdminRepository) *AdminHandler {
	return &AdminHandler{userRepo: userRepo, journeyRepo: journeyRepo, adminRepo: adminRepo}
}

// GET /api/admin/users
func (h *AdminHandler) ListUsers(c *gin.Context) {
	users, err := h.adminRepo.ListUsers(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(users))
}

// GET /api/admin/stats
func (h *AdminHandler) Stats(c *gin.Context) {
	stats, err := h.adminRepo.Stats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	c.JSON(http.StatusOK, newDataEnvelope(stats))
}

// GET /api/admin/export?format=json|csv
func (h *AdminHandler) ExportStats(c *gin.Context) {
	stats, err := h.adminRepo.Stats(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	if c.DefaultQuery("format", "json") == "csv" {
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="100-journeys-admin-stats.csv"`)
		writer := csv.NewWriter(c.Writer)
		_ = writer.Write([]string{"metric", "value"})
		_ = writer.Write([]string{"total_users", strconv.Itoa(stats.TotalUsers)})
		_ = writer.Write([]string{"total_journeys", strconv.Itoa(stats.TotalJourneys)})
		_ = writer.Write([]string{"total_points", strconv.Itoa(stats.TotalPoints)})
		_ = writer.Write([]string{"total_balance", strconv.Itoa(stats.TotalBalance)})
		_ = writer.Write([]string{"total_orders", strconv.Itoa(stats.TotalOrders)})
		_ = writer.Write([]string{"paid_orders", strconv.Itoa(stats.PaidOrders)})
		_ = writer.Write([]string{"gross_revenue", strconv.Itoa(stats.GrossRevenue)})
		_ = writer.Write([]string{"analytics_events", strconv.Itoa(stats.AnalyticsEvents)})
		_ = writer.Write([]string{"audit_logs", strconv.Itoa(stats.AuditLogs)})
		_ = writer.Write([]string{"audit_errors", strconv.Itoa(stats.AuditErrors)})
		writeMetricsCSV(writer, "top_clicked", stats.TopClickedJourneys)
		writeMetricsCSV(writer, "top_purchased", stats.TopPurchasedJourneys)
		writeDistributionCSV(writer, "mbti", stats.MBTIDistribution)
		writeDistributionCSV(writer, "gender", stats.GenderDistribution)
		writeDistributionCSV(writer, "purchase_gender", stats.PurchaseGenderDistribution)
		writer.Flush()
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(stats))
}

// AdminRoutes registers admin routes with RequireAdmin middleware.
func AdminRoutes(r *gin.RouterGroup, h *AdminHandler) {
	admin := r.Group("/admin")
	admin.Use(middleware.JWTAuth(), middleware.RequireAdmin())
	{
		admin.GET("/users", h.ListUsers)
		admin.GET("/stats", h.Stats)
		admin.GET("/export", h.ExportStats)
	}
}

func writeMetricsCSV(writer *csv.Writer, prefix string, rows []model.JourneyMetric) {
	for _, row := range rows {
		_ = writer.Write([]string{fmt.Sprintf("%s:%s:%s", prefix, row.Slug, row.Title), strconv.Itoa(row.Count)})
	}
}

func writeDistributionCSV(writer *csv.Writer, prefix string, rows []model.DistributionItem) {
	for _, row := range rows {
		_ = writer.Write([]string{fmt.Sprintf("%s:%s", prefix, row.Label), strconv.Itoa(row.Count)})
	}
}
