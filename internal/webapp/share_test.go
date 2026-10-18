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
