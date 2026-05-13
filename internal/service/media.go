package service

type MediaProvider interface {
	ResolveURL(path string) string
}

type LocalProvider struct {
	BaseURL string
}

func (p *LocalProvider) ResolveURL(path string) string {
	if path == "" {
		return ""
	}
	return p.BaseURL + "/" + path
}
