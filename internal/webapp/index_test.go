package webapp

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// UT-WEB-001: index rendering injects config and versions every static asset link.
func TestRenderIndex_InjectsConfigAndVersion(t *testing.T) {
	src := `<head><link rel="stylesheet" href="/static/css/tokens.css?v=__ASSET_VERSION__"></head>
<body><!-- App config injected by Go server -->
<script src="/static/js/api.js?v=__ASSET_VERSION__"></script></body>`
	out := RenderIndex(src, Config{MediaBase: "https://cdn.example.com/img", APIBase: "/api", AssetVersion: "abc123"})

	if strings.Contains(out, "__ASSET_VERSION__") {
		t.Fatalf("placeholder left in output: %s", out)
	}
	if !strings.Contains(out, `tokens.css?v=abc123`) || !strings.Contains(out, `api.js?v=abc123`) {
		t.Errorf("asset links not versioned: %s", out)
	}
	if !strings.Contains(out, `window.APP_CONFIG = {"apiBase":"/api","mediaBase":"https://cdn.example.com/img"}`) {
		t.Errorf("config not injected: %s", out)
	}
}

// UT-WEB-002: config values are JSON-encoded, so a hostile env value cannot break out of the script tag.
func TestRenderIndex_EscapesConfig(t *testing.T) {
	out := RenderIndex(`<!-- App config injected by Go server -->`, Config{MediaBase: `"</script><script>alert(1)</script>`, APIBase: "/api"})
	if strings.Contains(out, "</script><script>") {
		t.Fatalf("config not escaped: %s", out)
	}
}

// UT-WEB-003: the asset version changes when a static file changes and is stable otherwise.
func TestAssetVersion_TracksFileChanges(t *testing.T) {
	dir := t.TempDir()
	css := filepath.Join(dir, "css", "a.css")
	if err := os.MkdirAll(filepath.Dir(css), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(css, []byte("body{}"), 0o644); err != nil {
		t.Fatal(err)
	}
	v1 := AssetVersion(dir)
	if v1 == "" || v1 != AssetVersion(dir) {
		t.Fatalf("expected a stable non-empty version, got %q", v1)
	}
	if err := os.WriteFile(css, []byte("body{color:red}"), 0o644); err != nil {
		t.Fatal(err)
	}
	future := time.Now().Add(time.Minute)
	if err := os.Chtimes(css, future, future); err != nil {
		t.Fatal(err)
	}
	if v2 := AssetVersion(dir); v2 == v1 {
		t.Errorf("expected version to change after edit, still %q", v2)
	}
}
