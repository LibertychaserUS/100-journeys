// Package webapp renders the SPA shell (web/index.html) served for non-API routes.
package webapp

import (
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"path/filepath"
	"sort"
	"strings"
)

// Config is injected into the page as window.APP_CONFIG.
type Config struct {
	APIBase      string `json:"apiBase"`
	MediaBase    string `json:"mediaBase"`
	AssetVersion string `json:"-"`
}

const (
	configMarker        = "<!-- App config injected by Go server -->"
	versionMarker       = "__ASSET_VERSION__"
	legacyConfigHint    = `<!-- window.APP_CONFIG = { mediaBase: "...", apiBase: "/api" } -->`
	defaultAssetVersion = "dev"
)

// RenderIndex injects APP_CONFIG and stamps every "?v=__ASSET_VERSION__" link with the asset version,
// so long-lived immutable caching of /static never serves stale CSS/JS after a deploy.
func RenderIndex(html string, cfg Config) string {
	raw, _ := json.Marshal(cfg) // json.Marshal escapes <, > and & so values cannot close the script tag
	script := `<script>window.APP_CONFIG = ` + string(raw) + `;</script>`
	html = strings.Replace(html, configMarker, script, 1)
	html = strings.Replace(html, legacyConfigHint, "", 1)
	version := cfg.AssetVersion
	if version == "" {
		version = defaultAssetVersion
	}
	return strings.ReplaceAll(html, versionMarker, version)
}

// AssetVersion fingerprints the CSS and JS under webRoot (path, size, mtime), giving a short
// version that changes whenever a deploy changes a stylesheet or script.
func AssetVersion(webRoot string) string {
	var entries []string
	_ = filepath.WalkDir(webRoot, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return nil
		}
		ext := strings.ToLower(filepath.Ext(path))
		if ext != ".css" && ext != ".js" && ext != ".html" {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil
		}
		rel, _ := filepath.Rel(webRoot, path)
		entries = append(entries, fmt.Sprintf("%s:%d:%d", filepath.ToSlash(rel), info.Size(), info.ModTime().UnixNano()))
		return nil
	})
	if len(entries) == 0 {
		return defaultAssetVersion
	}
	sort.Strings(entries)
	sum := sha1.Sum([]byte(strings.Join(entries, "\n")))
	return hex.EncodeToString(sum[:])[:10]
}
