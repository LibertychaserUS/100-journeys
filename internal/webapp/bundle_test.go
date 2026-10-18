package webapp

import (
	"bytes"
	"compress/gzip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// UT-WEB-005: the shell loads one stylesheet and one script, built in the listed order.
func TestBundlePage(t *testing.T) {
	root := t.TempDir()
	write := func(rel, body string) {
		p := filepath.Join(root, rel)
		_ = os.MkdirAll(filepath.Dir(p), 0o755)
		_ = os.WriteFile(p, []byte(body), 0o644)
	}
	write("css/tokens.css", ":root{--a:1}")
	write("css/pages/home.css", ".home{}")
	write("js/config.js", "var A=1")
	write("js/router.js", "var B=A+1")
	page := `<head>
  <link rel="stylesheet" href="/static/css/tokens.css?v=__ASSET_VERSION__" />
  <link rel="stylesheet" href="/static/css/pages/home.css?v=__ASSET_VERSION__" />
</head><body>
  <script src="/static/js/config.js?v=__ASSET_VERSION__"></script>
  <script src="/static/js/router.js?v=__ASSET_VERSION__"></script>
</body>`
	out, b, err := BundlePage(page, root)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(out, "<link") != 1 || strings.Count(out, "<script") != 1 || !strings.Contains(out, "/bundle/app.css?v=__ASSET_VERSION__") {
		t.Fatalf("expected one link and one script:\n%s", out)
	}
	if i, j := bytes.Index(b.CSS, []byte("--a:1")), bytes.Index(b.CSS, []byte(".home")); i < 0 || j < i {
		t.Errorf("css out of order:\n%s", b.CSS)
	}
	if i, j := bytes.Index(b.JS, []byte("var A=1")), bytes.Index(b.JS, []byte("var B")); i < 0 || j < i {
		t.Errorf("js out of order:\n%s", b.JS)
	}
	r, _ := gzip.NewReader(bytes.NewReader(b.JSGz))
	raw, _ := io.ReadAll(r)
	if !bytes.Equal(raw, b.JS) {
		t.Error("gzip bundle differs from the plain one")
	}
	if _, _, err := BundlePage(`<link rel="stylesheet" href="/static/../secret.css?v=__ASSET_VERSION__" />`, root); err == nil {
		t.Error("paths outside css/ and js/ must be refused")
	}
}
