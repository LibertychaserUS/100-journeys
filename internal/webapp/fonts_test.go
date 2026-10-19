package webapp

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// UT-WEB-007: every self-hosted font face points at a file that exists, swaps instead of blocking,
// keeps its licence next to it, and no font file is left unreferenced.
func TestStoryFonts(t *testing.T) {
	web := filepath.Join("..", "..", "web")
	css, err := os.ReadFile(filepath.Join(web, "css", "fonts.css"))
	if err != nil {
		t.Fatal(err)
	}
	faces := regexp.MustCompile(`@font-face \{[^}]*\}`).FindAllString(string(css), -1)
	if len(faces) < 4 {
		t.Fatalf("fonts.css has %d faces", len(faces))
	}
	urlRe := regexp.MustCompile(`url\("/static/(assets/fonts/[^"]+\.woff2)"\)`)
	referenced := map[string]bool{}
	for _, f := range faces {
		m := urlRe.FindStringSubmatch(f)
		if m == nil {
			if !strings.Contains(f, "local(") {
				t.Errorf("face without a file or a local font: %s", f)
			}
			continue
		}
		if !strings.Contains(f, "font-display: swap") {
			t.Errorf("web font face does not swap: %s", m[1])
		}
		if !strings.Contains(f, "unicode-range:") {
			t.Errorf("web font face without unicode-range: %s", m[1])
		}
		if _, err := os.Stat(filepath.Join(web, filepath.FromSlash(m[1]))); err != nil {
			t.Errorf("missing font file %s", m[1])
		}
		referenced[filepath.Base(m[1])] = true
	}
	files, _ := filepath.Glob(filepath.Join(web, "assets", "fonts", "*.woff2"))
	for _, f := range files {
		if !referenced[filepath.Base(f)] {
			t.Errorf("font file not used by fonts.css: %s", filepath.Base(f))
		}
	}
	for _, lic := range []string{"OFL-NotoSerifSC.txt", "OFL-Newsreader.txt"} {
		b, err := os.ReadFile(filepath.Join(web, "assets", "fonts", lic))
		if err != nil || !strings.Contains(string(b), "SIL Open Font License") {
			t.Errorf("licence %s missing", lic)
		}
	}
	// The opening title's preloads name files that exist.
	index, _ := os.ReadFile(filepath.Join(web, "index.html"))
	block := regexp.MustCompile(`(?s)// fonts:begin.*?// fonts:end`).FindString(string(index))
	names := regexp.MustCompile(`"(story-serif-[^"]+\.woff2)"`).FindAllStringSubmatch(block, -1)
	if len(names) == 0 {
		t.Fatal("index.html preloads no story font")
	}
	for _, n := range names {
		if !referenced[n[1]] {
			t.Errorf("index.html preloads %s, which fonts.css does not use", n[1])
		}
	}
}
