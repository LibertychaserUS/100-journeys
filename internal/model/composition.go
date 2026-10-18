package model

import "time"

// CompositionPicks is the fragment key chosen in each group of the compose game; empty = left blank.
type CompositionPicks struct {
	Place    string `json:"place,omitempty"`
	Hour     string `json:"hour,omitempty"`
	Season   string `json:"season,omitempty"`
	Stay     string `json:"stay,omitempty"`
	Ritual   string `json:"ritual,omitempty"`
	Keepsake string `json:"keepsake,omitempty"`
}

// ByGroup lists the picks keyed by compose group name.
func (p CompositionPicks) ByGroup() map[string]string {
	return map[string]string{"place": p.Place, "hour": p.Hour, "season": p.Season, "stay": p.Stay, "ritual": p.Ritual, "keepsake": p.Keepsake}
}

// Composition is a ticket a signed-in user kept.
type Composition struct {
	ID     string           `json:"id"`
	Code   string           `json:"code"`
	UserID int64            `json:"-"`
	Picks  CompositionPicks `json:"picks"`
	// ParentCode is the station ticket this one set out from ("从这张票出发"), set once when kept.
	ParentCode string    `json:"parent_code,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// SharedComposition is the public, read-only view behind a share link (no id, no owner).
type SharedComposition struct {
	Code      string           `json:"code"`
	Picks     CompositionPicks `json:"picks"`
	CreatedAt time.Time        `json:"created_at"`
}

// KeepCompositionRequest is POST /api/auth/compositions. CreatedAt keeps the time a guest kept it.
type KeepCompositionRequest struct {
	ID         string           `json:"id"`
	Picks      CompositionPicks `json:"picks"`
	CreatedAt  string           `json:"created_at"`
	ParentCode string           `json:"parent_code"`
}
