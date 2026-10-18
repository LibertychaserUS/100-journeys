package service

import "testing"

// UT-SVC-LOCALE-001: lang tags normalize to the supported content locales.
func TestNormalizeLocale(t *testing.T) {
	cases := map[string]string{
		"":      "zh",
		"zh":    "zh",
		"zh-CN": "zh",
		"en":    "en",
		"EN-us": "en",
		"en_GB": "en",
		"fr":    "zh",
		"  en ": "en",
	}
	for in, want := range cases {
		if got := NormalizeLocale(in); got != want {
			t.Errorf("NormalizeLocale(%q) = %q, want %q", in, got, want)
		}
	}
}
