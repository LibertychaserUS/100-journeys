package model

type AnalyticsEventRequest struct {
	Type        string `json:"type" binding:"required"`
	JourneySlug string `json:"journey_slug,omitempty"`
	MBTIType    string `json:"mbti_type,omitempty"`
	Gender      string `json:"gender,omitempty"`
	Metadata    string `json:"metadata,omitempty"`
}

type AnalyticsTrackResponse struct {
	Accepted bool `json:"accepted"`
}
