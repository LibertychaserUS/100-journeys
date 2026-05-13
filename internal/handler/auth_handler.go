package handler

import (
	"net/http"

	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	userRepo repository.UserRepository
}

func NewAuthHandler(userRepo repository.UserRepository) *AuthHandler {
	return &AuthHandler{userRepo: userRepo}
}

// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	// Check if email already exists
	existing, err := h.userRepo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	if existing != nil {
		c.JSON(http.StatusConflict, newErrorEnvelope("email already registered"))
		return
	}

	// Hash password
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to hash password"))
		return
	}

	user := &model.User{
		Username:     req.Username,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         model.RoleUser,
		Level:        1,
		Points:       0,
	}

	if err := h.userRepo.Create(c.Request.Context(), user); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	// Award registration points
	_ = h.userRepo.AddPoints(c.Request.Context(), user.ID, 100, "register", "欢迎加入，注册奖励")

	// Generate JWT
	token, err := middleware.GenerateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to generate token"))
		return
	}

	c.JSON(http.StatusCreated, newDataEnvelope(model.AuthResponse{
		Token:     token,
		ExpiresIn: 604800, // 7 days
		User:      *user,
	}))
}

// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	user, err := h.userRepo.GetByEmail(c.Request.Context(), req.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	if user == nil {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("invalid email or password"))
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("invalid email or password"))
		return
	}

	// Award login points (once per day logic can be added later)
	_ = h.userRepo.AddPoints(c.Request.Context(), user.ID, 10, "login", "每日登录奖励")

	token, err := middleware.GenerateToken(user)
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to generate token"))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(model.AuthResponse{
		Token:     token,
		ExpiresIn: 604800,
		User:      *user,
	}))
}

// GET /api/auth/me
func (h *AuthHandler) Me(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("unauthorized"))
		return
	}

	user, err := h.userRepo.GetByID(c.Request.Context(), userID.(int64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}
	if user == nil {
		c.JSON(http.StatusNotFound, newErrorEnvelope("user not found"))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(user))
}

// POST /api/auth/save/:slug
func (h *AuthHandler) SaveJourney(c *gin.Context) {
	// TODO: resolve slug to journey_id via journey repo, then call userRepo.SaveJourney
	c.JSON(http.StatusNotImplemented, newErrorEnvelope("save journey: resolve slug to id first"))
}
