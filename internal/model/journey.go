package model

import "time"

type Journey struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Slug           string    `json:"slug"`
	Subtitle       string    `json:"subtitle,omitempty"`
	StoryHook      string    `json:"story_hook,omitempty"`
	Story          string    `json:"story,omitempty"`
	Region         string    `json:"region,omitempty"`
	FantasyType    string    `json:"fantasy_type"`
	VisualStyle    string    `json:"visual_style"`
	AdventureIndex int       `json:"adventure_index"`
	ObscurityLevel int       `json:"obscurity_level"`
	RiskLevel      int       `json:"risk_level"`
	MoodKeywords   []string  `json:"mood_keywords,omitempty"`
	ImagePath      string    `json:"-"` // raw DB path, resolved by service layer
	ImageURL       string    `json:"image_url"` // resolved by service layer (local or CDN)
	BookingURL     *string   `json:"booking_url,omitempty"`
	Price          int       `json:"price"`
	Tags           []Tag     `json:"tags,omitempty"`
	MBTITypes      []JourneyMBTI `json:"mbti_types,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Tag struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type MBTIType struct {
	ID          int64  `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Color       string `json:"color"`
}

type JourneyMBTI struct {
	MBTIType           MBTIType `json:"mbti_type"`
	CompatibilityScore int      `json:"compatibility_score"`
}

// JourneyFilter holds query parameters for list endpoint
type JourneyFilter struct {
	TagSlug        string `form:"tag"`
	VisualStyle    string `form:"visual_style"`
	FantasyType    string `form:"fantasy_type"`
	AdventureMin   int    `form:"adventure_min"`
	AdventureMax   int    `form:"adventure_max"`
	ObscurityMin   int    `form:"obscurity_min"`
	MBTIType       string `form:"mbti"`
	Page           int    `form:"page"`
	Limit          int    `form:"limit"`
}
