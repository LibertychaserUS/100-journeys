package webapp

import (
	"strings"
	"testing"
)

// UT-WEB-004: share pages carry escaped Open Graph tags and replace the title and description.
func TestRenderShare(t *testing.T) {
	page := "<html><head><title>Old</title><meta name=\"description\" content=\"old\" />\n  <meta property=\"og:title\" content=\"Site\" />\n  <meta name=\"twitter:card\" content=\"summary\" />\n</head><body></body></html>"
	got := RenderShare(page, ShareMeta{
		Title: `镜面 · 乌尤尼 <script>`, Description: `天亮前 "一刻钟"`, Image: "https://x.test/a.jpg", URL: "https://x.test/j/bolivia", Locale: "zh_CN",
	})
	for _, want := range []string{
		`<title>镜面 · 乌尤尼 &lt;script&gt;</title>`,
		`<meta name="description" content="天亮前 &#34;一刻钟&#34;" />`,
		`<meta property="og:image" content="https://x.test/a.jpg" />`,
		`<link rel="canonical" href="https://x.test/j/bolivia" />`,
		`<meta name="twitter:card" content="summary_large_image" />`,
	} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %s in\n%s", want, got)
		}
	}
	if strings.Contains(got, "<script>") || strings.Count(got, "<title>") != 1 || strings.Count(got, `property="og:title"`) != 1 || strings.Contains(got, `content="Site"`) {
		t.Errorf("unsafe or duplicated output:\n%s", got)
	}
}

// UT-WEB-006: a journey share page preloads its cover's AVIF set; other images get nothing.
func TestPreloadCover(t *testing.T) {
	got := PreloadCover("/static/assets/images/generated/norway-aurora-hunt/cover.jpg")
	if !strings.Contains(got, `type="image/avif"`) || !strings.Contains(got, "cover.720.avif 720w") {
		t.Errorf("unexpected preload: %s", got)
	}
	if PreloadCover("/static/assets/images/norway-aurora-2.jpg") != "" {
		t.Error("images without derivatives get no preload")
	}
}

// UT-WEB-008: the home page's share card speaks the reader's language: an English link gets
// English tags and lang, every card names both languages and x-default, and the image has a size
// and an alt; a path that is not a page is marked noindex.
func TestHomeMeta(t *testing.T) {
	page := `<html lang="zh-CN"><head><title>x</title><meta name="description" content="x" />` +
		`<meta property="og:title" content="x" /><meta property="og:description" content="x" />` +
		`<meta property="og:image" content="/static/assets/images/generated/hero-taoyuan-1600.jpg" /></head><body></body></html>`
	en := HomeMeta(page, "https://example.test", "en")
	for _, want := range []string{
		`<html lang="en">`, `<title>100 Journeys · `, `og:locale" content="en_US"`, `og:locale:alternate" content="zh_CN"`,
		`hreflang="zh-CN" href="https://example.test/"`, `hreflang="en" href="https://example.test/?lang=en"`, `hreflang="x-default"`,
		`<link rel="canonical" href="https://example.test/?lang=en"`, `og:image" content="https://example.test/static/`,
		`og:image:width" content="1600"`, `og:image:alt" content="Seen from behind`, `twitter:image:alt`,
	} {
		if !strings.Contains(en, want) {
			t.Errorf("English card lacks %q", want)
		}
	}
	zh := HomeMeta(page, "https://example.test", "fr")
	if !strings.Contains(zh, `<html lang="zh-CN">`) || !strings.Contains(zh, `og:locale" content="zh_CN"`) || !strings.Contains(zh, `<link rel="canonical" href="https://example.test/"`) {
		t.Errorf("an unknown language should fall back to the Chinese card")
	}
	if nf := NotFound(page); !strings.Contains(nf, `<meta name="robots" content="noindex" />`) {
		t.Errorf("not-found shell is not marked noindex")
	}
}
