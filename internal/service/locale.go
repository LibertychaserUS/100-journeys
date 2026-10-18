package service

import "strings"

// DefaultLocale is the language the base journey content is written in.
const DefaultLocale = "zh"

// supportedLocales lists the content languages with seeded translations.
var supportedLocales = map[string]bool{"zh": true, "en": true}

// NormalizeLocale maps a lang query or Accept-Language style tag ("en-US", "zh-CN") to a supported locale.
func NormalizeLocale(lang string) string {
	tag := strings.ToLower(strings.TrimSpace(lang))
	if i := strings.IndexAny(tag, "-_,;"); i >= 0 {
		tag = tag[:i]
	}
	if supportedLocales[tag] {
		return tag
	}
	return DefaultLocale
}

// translationLocale returns the locale to overlay, or "" when the base content already matches.
func translationLocale(locale string) string {
	if locale == DefaultLocale {
		return ""
	}
	return locale
}
