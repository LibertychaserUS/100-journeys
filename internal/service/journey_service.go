package service

// JourneyService — business logic layer.
// Implementation populated in SDD/TDD phase.

import (
	"context"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
)

type MediaProvider interface {
	ResolveURL(imagePath string) string
}

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
	journeys, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	for i := range journeys {
		journeys[i].ImageURL = s.media.ResolveURL(journeys[i].ImageURL)
	}
	return journeys, total, nil
}

func (s *JourneyService) GetJourney(ctx context.Context, slug string) (*model.Journey, error) {
	j, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	j.ImageURL = s.media.ResolveURL(j.ImageURL)
	return j, nil
}

func (s *JourneyService) ListTags(ctx context.Context) ([]model.Tag, error) {
	return s.repo.ListTags(ctx)
}
