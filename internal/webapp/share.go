package webapp

import (
	"html"
	"regexp"
	"strings"
)

// ShareMeta is what link previews (Open Graph / Twitter cards) show for a page. Crawlers don't
// run the SPA, so journey share links (/j/:slug) are rendered with these tags on the server.
type ShareMeta struct {
	Title       string
	Description string
	Image       string // absolute URL
	URL         string // canonical absolute URL
	Locale      string // og:locale, e.g. zh_CN or en_US
}

var (
	titleTag = regexp.MustCompile(`(?s)<title>.*?</title>`)
	descTag  = regexp.MustCompile(`<meta name="description" content="[^"]*"\s*/?>`)
	// The shell's own default share tags, removed so a crawler sees only the journey's.
	defaultShareTag = regexp.MustCompile(`[ \t]*<meta (?:property="og:|name="twitter:)[^>]*>\r?\n?`)
)

// RenderShare sets the page title and description and adds Open Graph and Twitter tags.
// Every value is HTML-escaped.
func RenderShare(page string, m ShareMeta) string {
	esc := html.EscapeString
	page = titleTag.ReplaceAllLiteralString(page, "<title>"+esc(m.Title)+"</title>")
	page = defaultShareTag.ReplaceAllLiteralString(page, "")
	page = descTag.ReplaceAllLiteralString(page, `<meta name="description" content="`+esc(m.Description)+`" />`)
	tags := []string{
		`<link rel="canonical" href="` + esc(m.URL) + `" />`,
		`<meta property="og:type" content="article" />`,
		`<meta property="og:site_name" content="桃源百旅 · 100 Journeys" />`,
		`<meta property="og:title" content="` + esc(m.Title) + `" />`,
		`<meta property="og:description" content="` + esc(m.Description) + `" />`,
		`<meta property="og:url" content="` + esc(m.URL) + `" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
		`<meta name="twitter:title" content="` + esc(m.Title) + `" />`,
		`<meta name="twitter:description" content="` + esc(m.Description) + `" />`,
	}
	if m.Image != "" {
		tags = append(tags, `<meta property="og:image" content="`+esc(m.Image)+`" />`, `<meta name="twitter:image" content="`+esc(m.Image)+`" />`)
	}
	if m.Locale != "" {
		tags = append(tags, `<meta property="og:locale" content="`+esc(m.Locale)+`" />`)
	}
	return strings.Replace(page, "</head>", "  "+strings.Join(tags, "\n  ")+"\n</head>", 1)
}
