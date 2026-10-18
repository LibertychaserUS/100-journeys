package model

type AIChatRequest struct {
	Message   string `json:"message" binding:"required"`
	SessionID string `json:"session_id"`
	Lang      string `json:"lang"`      // "zh" (default) or "en"
	MBTIType  string `json:"mbti_type"` // optional; steers recommendations, never echoed
}

type AIChatResponse struct {
	Reply   string     `json:"reply"`
	Actions []AIAction `json:"actions,omitempty"`
	// Source is "deepseek" for a model reply or "mock" for the rule-based fallback, so the
	// client can use its own localized rules when the model is not available.
	Source string `json:"source"`
}

type AIAction struct {
	Type string      `json:"type"` // "recommend", "mbti_quiz", "info"
	Data interface{} `json:"data,omitempty"`
}

type BookingResponse struct {
	JourneySlug       string  `json:"journey_slug"`
	BookingAvailable  bool    `json:"booking_available"`
	BookingURL        *string `json:"booking_url"`
	PartnerName       *string `json:"partner_name"`
	EstimatedPriceCNY *int    `json:"estimated_price_cny"`
	CTAText           string  `json:"cta_text"`
}
