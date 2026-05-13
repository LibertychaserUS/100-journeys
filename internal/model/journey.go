package model

import "time"

type Journey struct {
	ID             int64     `json:"id"`
	Title          string    `json:"title"`
	Slug           string    `json:"slug"`
	Subtitle       string    `json:"subtitle,omitempty"`
	Story          string    `json:"story,omitempty"`
	Region         string    `json:"region,omitempty"`
	VisualStyle    string    `json:"visual_style"`
	AdventureIndex int       `json:"adventure_index"`
	ObscurityLevel int       `json:"obscurity_level"`
	ImageURL       string    `json:"image_url"`  // resolved by service layer (local or CDN)
	Tags           []Tag     `json:"tags,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

type Tag struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

// JourneyFilter holds query parameters for list endpoint
type JourneyFilter struct {
	TagSlug        string `form:"tag"`
	VisualStyle    string `form:"visual_style"`
	AdventureMin   int    `form:"adventure_min"`
	AdventureMax   int    `form:"adventure_max"`
	ObscurityMin   int    `form:"obscurity_min"`
	Page           int    `form:"page"`
	Limit          int    `form:"limit"`
}
