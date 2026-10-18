package service

// JourneyService — business logic layer.

import (
	"context"
	"fmt"

	"github.com/100-journeys/app/internal/content"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
)

type JourneyService struct {
	repo  repository.JourneyRepository
	media MediaProvider
}

func NewJourneyService(repo repository.JourneyRepository, media MediaProvider) *JourneyService {
	return &JourneyService{repo: repo, media: media}
}

func (s *JourneyService) ListJourneys(ctx context.Context, filter model.JourneyFilter) ([]model.Journey, int, error) {
	if filter.Limit == 0 {
		filter.Limit = 12
	}
	if filter.Page <= 0 {
		filter.Page = 1
	}
	locale := NormalizeLocale(filter.Locale)
	filter.Locale = translationLocale(locale)
	journeys, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	if err := s.localize(ctx, journeys, locale); err != nil {
		return nil, 0, err
	}
	if err := s.attachContent(ctx, journeys, locale, false); err != nil {
		return nil, 0, err
	}
	for i := range journeys {
		journeys[i].ImageURL = s.media.ResolveURL(journeys[i].ImagePath)
	}
	return journeys, total, nil
}

// GetJourney returns one journey in the base language.
func (s *JourneyService) GetJourney(ctx context.Context, slug string) (*model.Journey, error) {
	return s.GetJourneyLocalized(ctx, slug, "")
}

// GetJourneyLocalized returns one journey with copy in the requested locale when a translation exists.
func (s *JourneyService) GetJourneyLocalized(ctx context.Context, slug, lang string) (*model.Journey, error) {
	j, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if j == nil {
		return nil, fmt.Errorf("journey not found: %s", slug)
	}
	one := []model.Journey{*j}
	if err := s.localize(ctx, one, NormalizeLocale(lang)); err != nil {
		return nil, err
	}
	if err := s.attachContent(ctx, one, NormalizeLocale(lang), true); err != nil {
		return nil, err
	}
	*j = one[0]
	j.ImageURL = s.media.ResolveURL(j.ImagePath)
	j.Scene = s.scene(j.Slug)
	return j, nil
}

// scene returns the journey's art direction with image URLs resolved, or nil.
func (s *JourneyService) scene(slug string) *model.JourneyScene {
	sc, ok := content.SceneFor(slug)
	if !ok {
		return nil
	}
	url := func(p string) string {
		if p == "" {
			return ""
		}
		return s.media.ResolveURL(p)
	}
	out := &model.JourneyScene{Motif: sc.Motif, Texture: sc.Texture, Accent: sc.Accent, Beats: sc.Beats}
	for _, t := range sc.Arc {
		out.Arc = append(out.Arc, model.SceneTone{H: t.H, S: t.S})
	}
	out.Images = model.SceneImages{Hero: url(sc.Images.Hero), Fork: url(sc.Images.Fork), Ending: url(sc.Images.Ending), Texture: url(sc.Images.Texture)}
	for _, p := range sc.Images.Scenes {
		out.Images.Scenes = append(out.Images.Scenes, url(p))
	}
	return out
}

// ListJourneysByIDs loads the given journeys and returns them in the order of ids.
func (s *JourneyService) ListJourneysByIDs(ctx context.Context, ids []int64, lang string) ([]model.Journey, error) {
	if len(ids) == 0 {
		return []model.Journey{}, nil
	}
	journeys, _, err := s.ListJourneys(ctx, model.JourneyFilter{IDs: ids, Limit: len(ids), Locale: lang})
	if err != nil {
		return nil, err
	}
	byID := make(map[int64]model.Journey, len(journeys))
	for _, j := range journeys {
		byID[j.ID] = j
	}
	ordered := make([]model.Journey, 0, len(ids))
	for _, id := range ids {
		if j, ok := byID[id]; ok {
			ordered = append(ordered, j)
		}
	}
	return ordered, nil
}

func (s *JourneyService) attachContent(ctx context.Context, journeys []model.Journey, locale string, full bool) error {
	loader, ok := s.repo.(repository.JourneyContentLoader)
	if !ok {
		return nil
	}
	return loader.LoadContent(ctx, journeys, locale, full)
}

func (s *JourneyService) localize(ctx context.Context, journeys []model.Journey, locale string) error {
	for i := range journeys {
		journeys[i].Locale = DefaultLocale
	}
	tl := translationLocale(locale)
	if tl == "" {
		return nil
	}
	translator, ok := s.repo.(repository.JourneyTranslator)
	if !ok {
		return nil
	}
	return translator.ApplyTranslations(ctx, journeys, tl)
}

func (s *JourneyService) ListTags(ctx context.Context) ([]model.Tag, error) {
	return s.repo.ListTags(ctx)
}

func (s *JourneyService) ListMBTITypes(ctx context.Context) ([]model.MBTIType, error) {
	return s.repo.ListMBTITypes(ctx)
}

func (s *JourneyService) GetBookingInfo(ctx context.Context, slug string) (*model.BookingResponse, error) {
	j, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if j == nil {
		return nil, fmt.Errorf("journey not found: %s", slug)
	}

	resp := &model.BookingResponse{
		JourneySlug:      slug,
		BookingAvailable: true,
		BookingURL:       j.BookingURL,
		CTAText:          "联系我们获取定制行程",
	}
	return resp, nil
}
