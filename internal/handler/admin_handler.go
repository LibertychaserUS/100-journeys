package handler

import (
	"bytes"
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
		var buf bytes.Buffer
		writer := csv.NewWriter(&buf)
		if err := writeAdminStatsCSV(writer, stats); err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
			return
		}
		writer.Flush()
		if err := writer.Error(); err != nil {
			c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
			return
		}
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="100-journeys-admin-stats.csv"`)
		c.String(http.StatusOK, buf.String())
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

func writeAdminStatsCSV(writer *csv.Writer, stats *model.AdminStats) error {
	rows := [][]string{
		{"metric", "value"},
		{"total_users", strconv.Itoa(stats.TotalUsers)},
		{"total_journeys", strconv.Itoa(stats.TotalJourneys)},
		{"total_points", strconv.Itoa(stats.TotalPoints)},
		{"total_balance", strconv.Itoa(stats.TotalBalance)},
		{"total_orders", strconv.Itoa(stats.TotalOrders)},
		{"paid_orders", strconv.Itoa(stats.PaidOrders)},
		{"gross_revenue", strconv.Itoa(stats.GrossRevenue)},
		{"analytics_events", strconv.Itoa(stats.AnalyticsEvents)},
		{"audit_logs", strconv.Itoa(stats.AuditLogs)},
		{"audit_errors", strconv.Itoa(stats.AuditErrors)},
	}
	for _, row := range rows {
		if err := writer.Write(row); err != nil {
			return err
		}
	}
	if err := writeMetricsCSV(writer, "top_clicked", stats.TopClickedJourneys); err != nil {
		return err
	}
	if err := writeMetricsCSV(writer, "top_purchased", stats.TopPurchasedJourneys); err != nil {
		return err
	}
	if err := writeDistributionCSV(writer, "mbti", stats.MBTIDistribution); err != nil {
		return err
	}
	if err := writeDistributionCSV(writer, "gender", stats.GenderDistribution); err != nil {
		return err
	}
	return writeDistributionCSV(writer, "purchase_gender", stats.PurchaseGenderDistribution)
}

func writeMetricsCSV(writer *csv.Writer, prefix string, rows []model.JourneyMetric) error {
	for _, row := range rows {
		if err := writer.Write([]string{fmt.Sprintf("%s:%s:%s", prefix, row.Slug, row.Title), strconv.Itoa(row.Count)}); err != nil {
			return err
		}
	}
	return nil
}

func writeDistributionCSV(writer *csv.Writer, prefix string, rows []model.DistributionItem) error {
	for _, row := range rows {
		if err := writer.Write([]string{fmt.Sprintf("%s:%s", prefix, row.Label), strconv.Itoa(row.Count)}); err != nil {
			return err
		}
	}
	return nil
}
