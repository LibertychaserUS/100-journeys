package content

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"regexp"
	"strings"
	"sync"
)

// Scene is a journey's art direction for the immersive detail page: one file per slug under
// scenes/, kept apart from the copy so design and writing can change independently.
// See docs/content/SCHEMA.md ("Scenes").
type Scene struct {
	Slug    string      `json:"slug"`
	Motif   string      `json:"motif"`   // the one scroll motion only this journey has
	Texture string      `json:"texture"` // overlay grain/pattern
	Arc     []Tone      `json:"arc"`     // the lighting arc, hero → … → ending
	Accent  string      `json:"accent"`  // decorative only (glows, lines), never text or controls
	Beats   []string    `json:"beats"`   // per chapter: what the motif does there ("" = nothing special)
	Images  SceneImages `json:"images"`
}

// Tone is one stop of the lighting arc as hue and saturation; lightness comes from the theme
// so text stays readable in both.
type Tone struct {
	H int `json:"h"`
	S int `json:"s"`
}

// SceneImages are optional per-scene images under web/assets/images (generated/<slug>/…).
// Empty means "fall back to the cover".
type SceneImages struct {
	Hero    string   `json:"hero"`
	Scenes  []string `json:"scenes"`
	Fork    string   `json:"fork"`
	Ending  string   `json:"ending"`
	Texture string   `json:"texture"`
}

// Motifs and textures the page knows how to draw. A motif listed here but not yet drawn by
// web/js/scenes.js falls back to a gentle drift, so data can be authored ahead of the code.
var (
	Motifs   = []string{"mirror", "descent", "aurora", "sky-rotate", "mist", "tide", "track", "map", "rise"}
	Textures = []string{"salt", "ember", "stars", "sand", "ink", "caustics", "snow", "dust", "paper", "haze", "fog"}
	// Beats a chapter can ask of the motif: the light goes out, the world holds still, a faint
	// first sign, the full flare, the space opens up.
	Beats = []string{"", "dark", "still", "grey", "flare", "vast"}
)

var hexColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

var (
	scenesOnce sync.Once
	scenesBy   map[string]Scene
	scenesErr  error
)

// LoadScenes reads every embedded scene file.
func LoadScenes() ([]Scene, error) {
	paths, err := fs.Glob(files, "scenes/*.json")
	if err != nil {
		return nil, err
	}
	out := make([]Scene, 0, len(paths))
	for _, p := range paths {
		raw, err := files.ReadFile(p)
		if err != nil {
			return nil, err
		}
		var s Scene
		dec := json.NewDecoder(strings.NewReader(string(raw)))
		dec.DisallowUnknownFields()
		if err := dec.Decode(&s); err != nil {
			return nil, fmt.Errorf("%s: %w", p, err)
		}
		out = append(out, s)
	}
	return out, nil
}

// SceneFor returns the art direction for slug, if any.
func SceneFor(slug string) (Scene, bool) {
	scenesOnce.Do(func() {
		var all []Scene
		all, scenesErr = LoadScenes()
		scenesBy = make(map[string]Scene, len(all))
		for _, s := range all {
			scenesBy[s.Slug] = s
		}
	})
	s, ok := scenesBy[slug]
	return s, ok
}

// ValidateScene returns problems; images are checked by the test against the asset folder.
func ValidateScene(s Scene) []string {
	var p []string
	add := func(format string, a ...interface{}) { p = append(p, fmt.Sprintf(format, a...)) }
	if s.Slug == "" {
		add("slug is required")
	}
	if !contains(Motifs, s.Motif) {
		add("unknown motif %q", s.Motif)
	}
	if !contains(Textures, s.Texture) {
		add("unknown texture %q", s.Texture)
	}
	if n := len(s.Arc); n < 3 || n > 8 {
		add("arc needs 3-8 tones, has %d", n)
	}
	for i, t := range s.Arc {
		if t.H < 0 || t.H > 360 || t.S < 0 || t.S > 100 {
			add("arc tone %d out of range", i+1)
		}
	}
	if !hexColor.MatchString(s.Accent) {
		add("accent must be #rrggbb")
	}
	if len(s.Beats) > 5 {
		add("at most 5 beats (one per chapter)")
	}
	for i, b := range s.Beats {
		if !contains(Beats, b) {
			add("chapter %d: unknown beat %q", i+1, b)
		}
	}
	if len(s.Images.Scenes) > 5 {
		add("at most 5 scene images")
	}
	return p
}

// ImagePaths lists every image a scene names (for the asset check).
func (s Scene) ImagePaths() []string {
	var out []string
	for _, v := range append([]string{s.Images.Hero, s.Images.Fork, s.Images.Ending, s.Images.Texture}, s.Images.Scenes...) {
		if v != "" {
			out = append(out, v)
		}
	}
	return out
}
