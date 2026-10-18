package webapp

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
)

// Bundles are the page's stylesheets and scripts concatenated in the order index.html lists
// them (CSS keeps its layer order), so a first visit makes two requests instead of dozens.
// The source files stay separate and editable; the server builds the bundles from them.
type Bundles struct {
	CSS, JS     []byte
	CSSGz, JSGz []byte
}

var (
	cssLink   = regexp.MustCompile(`[ \t]*<link rel="stylesheet" href="/static/([^"?]+)\?v=__ASSET_VERSION__" />\r?\n?`)
	jsScript  = regexp.MustCompile(`[ \t]*<script src="/static/([^"?]+)\?v=__ASSET_VERSION__"></script>\r?\n?`)
	safeAsset = regexp.MustCompile(`^(css|js)/[a-z0-9/_\-]+\.(css|js)$`)
)

// BundlePage rewrites the shell to load /bundle/app.css and /bundle/app.js and builds both
// from the files it referenced under webRoot.
func BundlePage(page, webRoot string) (string, *Bundles, error) {
	var css, js bytes.Buffer
	read := func(rel string) ([]byte, error) {
		if !safeAsset.MatchString(rel) {
			return nil, fmt.Errorf("unexpected asset path %q", rel)
		}
		return os.ReadFile(filepath.Join(webRoot, filepath.FromSlash(rel)))
	}
	var err error
	first := true
	page = cssLink.ReplaceAllStringFunc(page, func(tag string) string {
		rel := cssLink.FindStringSubmatch(tag)[1]
		b, e := read(rel)
		if e != nil && err == nil {
			err = e
		}
		fmt.Fprintf(&css, "/* %s */\n%s\n", rel, b)
		if first {
			first = false
			return `  <link rel="stylesheet" href="/bundle/app.css?v=__ASSET_VERSION__" />` + "\n"
		}
		return ""
	})
	first = true
	page = jsScript.ReplaceAllStringFunc(page, func(tag string) string {
		rel := jsScript.FindStringSubmatch(tag)[1]
		b, e := read(rel)
		if e != nil && err == nil {
			err = e
		}
		fmt.Fprintf(&js, "/* %s */\n%s\n;\n", rel, b)
		if first {
			first = false
			return `  <script src="/bundle/app.js?v=__ASSET_VERSION__" defer></script>` + "\n"
		}
		return ""
	})
	if err != nil {
		return "", nil, err
	}
	b := &Bundles{CSS: css.Bytes(), JS: js.Bytes()}
	b.CSSGz, b.JSGz = gz(b.CSS), gz(b.JS)
	return page, b, nil
}

func gz(b []byte) []byte {
	var out bytes.Buffer
	w, _ := gzip.NewWriterLevel(&out, gzip.BestCompression)
	_, _ = w.Write(b)
	_ = w.Close()
	return out.Bytes()
}

// BundleCache rebuilds the bundles only when the asset version changes.
type BundleCache struct {
	mu      sync.Mutex
	version string
	page    string
	b       *Bundles
}

// Get returns the bundled shell and bundles for the current asset version.
func (c *BundleCache) Get(rawPage, webRoot, version string) (string, *Bundles, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.b != nil && c.version == version {
		return c.page, c.b, nil
	}
	page, b, err := BundlePage(rawPage, webRoot)
	if err != nil {
		return "", nil, err
	}
	c.version, c.page, c.b = version, page, b
	return page, b, nil
}

// AcceptsGzip reports whether an Accept-Encoding header allows gzip.
func AcceptsGzip(acceptEncoding string) bool {
	return strings.Contains(acceptEncoding, "gzip")
}
