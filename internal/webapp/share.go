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
	Preload     string // optional <link rel="preload"> for the page's opening image
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
	if m.Preload != "" {
		tags = append(tags, m.Preload)
	}
	if m.Locale != "" {
		tags = append(tags, `<meta property="og:locale" content="`+esc(m.Locale)+`" />`)
	}
	return strings.Replace(page, "</head>", "  "+strings.Join(tags, "\n  ")+"\n</head>", 1)
}

var coverJPEG = regexp.MustCompile(`/generated/[^/]+/cover\.jpg$`)

// PreloadCover is a typed AVIF preload for a generated cover's derivatives (browsers that can't
// decode AVIF skip it), or "" when the image has none.
func PreloadCover(src string) string {
	if !coverJPEG.MatchString(src) {
		return ""
	}
	base := strings.TrimSuffix(src, ".jpg")
	set := base + ".480.avif 480w, " + base + ".720.avif 720w, " + base + ".1120.avif 1120w"
	return `<link rel="preload" as="image" type="image/avif" fetchpriority="high" href="` + html.EscapeString(base+".1120.avif") +
		`" imagesrcset="` + html.EscapeString(set) + `" imagesizes="100vw" />`
}

// Home is the home page's share card in one language: crawlers don't run the app, so an English
// link (?lang=en) gets English tags, and each language names the other as its alternate.
type Home struct {
	Lang, Title, Description, ImageAlt string
}

// HomeCards are the home page's two share cards; zh is the default.
var HomeCards = map[string]Home{
	"zh": {Lang: "zh-CN", Title: "桃源百旅 · 一百扇只在自己的时辰打开的门",
		Description: "一百扇藏在真实地方的门，每一扇只在自己的季节、自己的时辰打开。",
		ImageAlt:    "桃花林中的溪边，一个提着纸灯笼的旅人背影，望着山壁上一道透着光的窄缝"},
	"en": {Lang: "en", Title: "100 Journeys · A hundred doors, each opening only at its own hour",
		Description: "A hundred doors hidden in real places, each opening only in its own season and hour.",
		ImageAlt:    "Seen from behind, a traveller with a paper lantern stands by a stream among peach blossom, facing a narrow lit cleft in the rock"},
}

var (
	htmlLang = regexp.MustCompile(`<html lang="[^"]*">`)
	ogTitle  = regexp.MustCompile(`<meta property="og:title" content="[^"]*"\s*/?>`)
	ogDesc   = regexp.MustCompile(`<meta property="og:description" content="[^"]*"\s*/?>`)
	ogImage  = regexp.MustCompile(`<meta property="og:image" content="([^"]*)"`)
)

// HomeMeta completes the shell's share tags for the home page in the reader's language (lang is
// "zh" or "en"): absolute image and URL with its size and alt, a canonical link, hreflang pairs and
// x-default, both locales, Twitter's tags and a WebSite description.
func HomeMeta(page, origin, lang string) string {
	esc := html.EscapeString
	card, ok := HomeCards[lang]
	if !ok {
		lang, card = "zh", HomeCards["zh"]
	}
	page = strings.Replace(page, `content="/static/`, `content="`+esc(origin)+`/static/`, -1)
	page = htmlLang.ReplaceAllLiteralString(page, `<html lang="`+card.Lang+`">`)
	page = titleTag.ReplaceAllLiteralString(page, "<title>"+esc(card.Title)+"</title>")
	page = descTag.ReplaceAllLiteralString(page, `<meta name="description" content="`+esc(card.Description)+`" />`)
	page = ogTitle.ReplaceAllLiteralString(page, `<meta property="og:title" content="`+esc(card.Title)+`" />`)
	page = ogDesc.ReplaceAllLiteralString(page, `<meta property="og:description" content="`+esc(card.Description)+`" />`)
	image := ""
	if m := ogImage.FindStringSubmatch(page); m != nil {
		image = m[1]
	}
	home := esc(origin) + "/"
	self, locale, other := home, "zh_CN", "en_US"
	if lang == "en" {
		self, locale, other = home+"?lang=en", "en_US", "zh_CN"
	}
	ld := `{"@context":"https://schema.org","@type":"WebSite","name":"桃源百旅 · 100 Journeys","url":"` + home +
		`","inLanguage":["zh-CN","en"],"potentialAction":{"@type":"SearchAction","target":"` + home +
		`#/explore?q={search_term_string}","query-input":"required name=search_term_string"}}`
	tags := []string{
		`<link rel="canonical" href="` + self + `" />`,
		`<link rel="alternate" hreflang="zh-CN" href="` + home + `" />`,
		`<link rel="alternate" hreflang="en" href="` + home + `?lang=en" />`,
		`<link rel="alternate" hreflang="x-default" href="` + home + `" />`,
		`<meta property="og:url" content="` + self + `" />`,
		`<meta property="og:locale" content="` + locale + `" />`,
		`<meta property="og:locale:alternate" content="` + other + `" />`,
		`<meta property="og:image:width" content="1600" />`,
		`<meta property="og:image:height" content="900" />`,
		`<meta property="og:image:alt" content="` + esc(card.ImageAlt) + `" />`,
		`<meta name="twitter:title" content="` + esc(card.Title) + `" />`,
		`<meta name="twitter:description" content="` + esc(card.Description) + `" />`,
		`<meta name="twitter:image" content="` + image + `" />`,
		`<meta name="twitter:image:alt" content="` + esc(card.ImageAlt) + `" />`,
		`<script type="application/ld+json">` + ld + `</script>`,
	}
	return strings.Replace(page, "</head>", "  "+strings.Join(tags, "\n  ")+"\n</head>", 1)
}

// NotFound marks the shell served for a path that is not a page: crawlers get a 404 they should
// not index (the app shows its own not-found page).
func NotFound(page string) string {
	return strings.Replace(page, "</head>", `  <meta name="robots" content="noindex" />`+"\n</head>", 1)
}
