package service

// JourneyService — business logic layer.

import (
	"context"
	"fmt"

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
	journeys, total, err := s.repo.List(ctx, filter)
	if err != nil {
		return nil, 0, err
	}
	for i := range journeys {
		journeys[i].ImageURL = s.media.ResolveURL(journeys[i].ImagePath)
	}
	return journeys, total, nil
}

func (s *JourneyService) GetJourney(ctx context.Context, slug string) (*model.Journey, error) {
	j, err := s.repo.GetBySlug(ctx, slug)
	if err != nil {
		return nil, err
	}
	if j == nil {
		return nil, fmt.Errorf("journey not found: %s", slug)
	}
	j.ImageURL = s.media.ResolveURL(j.ImagePath)
	return j, nil
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
