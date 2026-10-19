package model

import "time"

type Journey struct {
	ID             int64    `json:"id"`
	Title          string   `json:"title"`
	Slug           string   `json:"slug"`
	Subtitle       string   `json:"subtitle,omitempty"`
	StoryHook      string   `json:"story_hook,omitempty"`
	Story          string   `json:"story,omitempty"`
	Region         string   `json:"region,omitempty"`
	FantasyType    string   `json:"fantasy_type"`
	VisualStyle    string   `json:"visual_style"`
	AdventureIndex int      `json:"adventure_index"`
	ObscurityLevel int      `json:"obscurity_level"`
	RiskLevel      int      `json:"risk_level"`
	MoodKeywords   []string `json:"mood_keywords,omitempty"`
	ImagePath      string   `json:"-"`         // raw DB path, resolved by service layer
	ImageURL       string   `json:"image_url"` // resolved by service layer (local or CDN)
	// HeroURL is the journey's own landscape opening image, when it has one (list and detail).
	HeroURL    string  `json:"hero_url,omitempty"`
	BookingURL *string `json:"booking_url,omitempty"`
	Price      int     `json:"price"`
	Locale     string  `json:"locale"` // content language actually returned: "zh" (base) or a translation
	// Entrance and Content come from internal/content (authored journeys). Content is complete on
	// the detail endpoint; list endpoints only carry Content.Opens and Content.Role.
	Entrance *JourneyEntrance `json:"entrance,omitempty"`
	Content  *JourneyContent  `json:"content,omitempty"`
	// Scene is the journey's art direction for the immersive detail page (detail endpoint only).
	Scene     *JourneyScene `json:"scene,omitempty"`
	Tags      []Tag         `json:"tags,omitempty"`
	MBTITypes []JourneyMBTI `json:"mbti_types,omitempty"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
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
	Query        string  `form:"q"`
	TagSlug      string  `form:"tag"`
	VisualStyle  string  `form:"visual_style"`
	FantasyType  string  `form:"fantasy_type"`
	Realm        string  `form:"realm"` // the entrance's realm (mirror-salt, fire-stone, ...)
	AdventureMin int     `form:"adventure_min"`
	AdventureMax int     `form:"adventure_max"`
	ObscurityMin int     `form:"obscurity_min"`
	MBTIType     string  `form:"mbti"`
	Locale       string  `form:"lang"` // requested content language; normalized by the service layer
	Page         int     `form:"page"`
	Limit        int     `form:"limit"`
	IDs          []int64 `form:"-"` // internal: restrict to these journey IDs (e.g. a user's saved list)
}

// JourneyTranslation is localized copy for one journey; empty fields fall back to the base language.
type JourneyTranslation struct {
	JourneyID    int64
	Locale       string
	Title        string
	Subtitle     string
	StoryHook    string
	Story        string
	Region       string
	MoodKeywords []string
}

// DoorWindow is when a door opens on its own clock. Either a fixed local span (At–Until, "HH:MM",
// which may run past midnight) or a span around the sun (Sun "rise", "set" or "noon", From–To in
// minutes), or Moon "dark": the night hours with the moon below the horizon. Days limits it to ISO
// weekdays (1 Monday – 7 Sunday), Except skips dates ("MM-DD"), MoonAge to days since new moon.
// Needs names a condition the site cannot see (rain, tide, mist…): it is said, not claimed.
type DoorWindow struct {
	At      string    `json:"at,omitempty"`
	Until   string    `json:"until,omitempty"`
	Sun     string    `json:"sun,omitempty"`
	From    int       `json:"from,omitempty"`
	To      int       `json:"to,omitempty"`
	Moon    string    `json:"moon,omitempty"`
	MoonAge []float64 `json:"moon_age,omitempty"`
	Days    []int     `json:"days,omitempty"`
	Except  []string  `json:"except,omitempty"`
	Needs   string    `json:"needs,omitempty"`
}

// JourneyEntrance is the language-independent world data of an authored journey.
type JourneyEntrance struct {
	No           int         `json:"no"`
	Realm        string      `json:"realm"`
	Pace         string      `json:"pace"`
	Scale        string      `json:"scale"`
	Seasons      []string    `json:"seasons"`
	Time         string      `json:"time"`
	TZ           string      `json:"tz,omitempty"`     // the place's IANA time zone
	Months       []int       `json:"months,omitempty"` // months it opens in, 1–12
	Lat          *float64    `json:"lat,omitempty"`    // where the door is, for its sun and moon
	Lon          *float64    `json:"lon,omitempty"`
	Window       *DoorWindow `json:"window,omitempty"` // when it opens on those days
	CoverLicense string      `json:"cover_license,omitempty"`
	CoverSource  string      `json:"cover_source,omitempty"`
}

// JourneyContent is the localized, structured narrative of an authored journey.
type JourneyContent struct {
	Opens    string           `json:"opens"`
	Role     string           `json:"role"`
	Premise  string           `json:"premise,omitempty"`
	Mission  string           `json:"mission,omitempty"`
	Chapters []ContentChapter `json:"chapters,omitempty"`
	Choice   *ContentChoice   `json:"choice,omitempty"`
	Ending   string           `json:"ending,omitempty"`
	Facts    []ContentFact    `json:"facts,omitempty"`
	Fiction  string           `json:"fiction,omitempty"`
	Locale   string           `json:"locale"`
}

type ContentChapter struct {
	Title      string   `json:"title"`
	Paragraphs []string `json:"paragraphs"`
}

type ContentChoice struct {
	Prompt  string          `json:"prompt"`
	Options []ContentOption `json:"options"`
}

type ContentOption struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Keeps string `json:"keeps"`
}

type ContentFact struct {
	Text   string `json:"text"`
	Source string `json:"source"`
}

// JourneyScene is the art direction of a journey's detail page, with image URLs resolved.
// Empty image URLs mean "use the cover".
type JourneyScene struct {
	Motif   string      `json:"motif"`
	Texture string      `json:"texture"`
	Arc     []SceneTone `json:"arc"`
	Accent  string      `json:"accent"`
	Beats   []string    `json:"beats,omitempty"`
	Images  SceneImages `json:"images"`
}

type SceneTone struct {
	H int `json:"h"`
	S int `json:"s"`
}

type SceneImages struct {
	Hero    string   `json:"hero,omitempty"`
	Scenes  []string `json:"scenes,omitempty"`
	Fork    string   `json:"fork,omitempty"`
	Ending  string   `json:"ending,omitempty"`
	Texture string   `json:"texture,omitempty"`
}
