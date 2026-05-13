package model

// AdminStats is the real-time-ish dashboard aggregate payload.
// P0 financial truth comes from orders and transactions, not analytics events.
type AdminStats struct {
	TotalUsers                 int                `json:"total_users"`
	TotalJourneys              int                `json:"total_journeys"`
	TotalPoints                int                `json:"total_points"`
	TotalBalance               int                `json:"total_balance"`
	TotalOrders                int                `json:"total_orders"`
	PaidOrders                 int                `json:"paid_orders"`
	GrossRevenue               int                `json:"gross_revenue"`
	TotalTransactions          int                `json:"total_transactions"`
	AnalyticsEvents            int                `json:"analytics_events"`
	AuditLogs                  int                `json:"audit_logs"`
	AuditErrors                int                `json:"audit_errors"`
	TopClickedJourneys         []JourneyMetric    `json:"top_clicked_journeys"`
	TopPurchasedJourneys       []JourneyMetric    `json:"top_purchased_journeys"`
	MBTIDistribution           []DistributionItem `json:"mbti_distribution"`
	GenderDistribution         []DistributionItem `json:"gender_distribution"`
	PurchaseGenderDistribution []DistributionItem `json:"purchase_gender_distribution"`
}

type JourneyMetric struct {
	Slug    string  `json:"slug"`
	Title   string  `json:"title,omitempty"`
	Count   int     `json:"count"`
	Revenue int     `json:"revenue,omitempty"`
	Rate    float64 `json:"rate,omitempty"`
}

type DistributionItem struct {
	Label   string  `json:"label"`
	Count   int     `json:"count"`
	Percent float64 `json:"percent"`
}
