package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/100-journeys/app/internal/eventbus"
	"github.com/100-journeys/app/internal/middleware"
	"github.com/100-journeys/app/internal/model"
	"github.com/100-journeys/app/internal/repository"
	"github.com/100-journeys/app/internal/service"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	userRepo      repository.UserRepository
	captchaStore  *service.CaptchaStore
	avatarRoot    string
	avatarURLBase string
}

func NewAuthHandler(userRepo repository.UserRepository, captchaStore *service.CaptchaStore, avatarRoots ...string) *AuthHandler {
	avatarRoot := filepath.Join("data", "uploads", "avatars")
	if len(avatarRoots) > 0 && avatarRoots[0] != "" {
		avatarRoot = avatarRoots[0]
	}
	return &AuthHandler{
		userRepo:      userRepo,
		captchaStore:  captchaStore,
		avatarRoot:    avatarRoot,
		avatarURLBase: "/uploads/avatars",
	}
}

// POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req model.RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	// Verify captcha
	if !h.captchaStore.Verify(req.CaptchaID, req.CaptchaAnswer) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("验证码错误或已过期"))
		return
	}

	if err := validateUsername(req.Username); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}
	if err := validatePassword(req.Password); err != nil {
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
		Gender:       req.Gender,
	}

	if err := h.userRepo.Create(c.Request.Context(), user); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	// Award registration points (5000 welcome bonus)
	_ = h.userRepo.AddPoints(c.Request.Context(), user.ID, 5000, "register", "欢迎加入，注册奖励5000积分")
	user.Points = 5000

	eventbus.Default.Publish(eventbus.UserRegistered, map[string]interface{}{
		"user_id":  user.ID,
		"username": user.Username,
		"email":    user.Email,
	})

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

// POST /api/auth/avatar
func (h *AuthHandler) UploadAvatar(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, newErrorEnvelope("unauthorized"))
		return
	}
	uid, ok := userID.(int64)
	if !ok {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("invalid user context"))
		return
	}

	fileHeader, err := c.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("avatar file is required"))
		return
	}
	if fileHeader.Size > maxAvatarBytes {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("avatar must be 512KB or smaller"))
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("failed to open avatar"))
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxAvatarBytes+1))
	if closeErr := file.Close(); closeErr != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("failed to close avatar"))
		return
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("failed to read avatar"))
		return
	}
	if int64(len(data)) > maxAvatarBytes {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("avatar must be 512KB or smaller"))
		return
	}

	contentType := http.DetectContentType(data)
	ext, ok := avatarExtension(contentType)
	if !ok {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("avatar must be jpeg, png, or webp"))
		return
	}

	userDir := filepath.Join(h.avatarRoot, fmt.Sprintf("u_%d", uid))
	if err := os.MkdirAll(userDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to create avatar directory"))
		return
	}
	avatarPath := filepath.Join(userDir, "avatar"+ext)
	if err := os.WriteFile(avatarPath, data, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope("failed to save avatar"))
		return
	}

	avatarURL := fmt.Sprintf("%s/u_%d/avatar%s", h.avatarURLBase, uid, ext)
	if err := h.userRepo.UpdateAvatar(c.Request.Context(), uid, avatarURL); err != nil {
		c.JSON(http.StatusInternalServerError, newErrorEnvelope(err.Error()))
		return
	}

	c.JSON(http.StatusOK, newDataEnvelope(gin.H{"avatar_url": avatarURL, "user_id": uid}))
}

// POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req model.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, newErrorEnvelope(err.Error()))
		return
	}

	// Verify captcha
	if !h.captchaStore.Verify(req.CaptchaID, req.CaptchaAnswer) {
		c.JSON(http.StatusBadRequest, newErrorEnvelope("验证码错误或已过期"))
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

const maxAvatarBytes int64 = 512 * 1024

var (
	usernamePattern = regexp.MustCompile(`^[\p{Han}A-Za-z0-9_-]{2,30}$`)
	passwordPattern = regexp.MustCompile(`^[A-Za-z0-9!@#$%^&*()_+=,.?/-]{8,72}$`)
)

func validateUsername(username string) error {
	if !usernamePattern.MatchString(strings.TrimSpace(username)) {
		return fmt.Errorf("username may only contain Chinese characters, letters, numbers, underscore, or hyphen")
	}
	return nil
}

func validatePassword(password string) error {
	if !passwordPattern.MatchString(password) {
		return fmt.Errorf("password must be 8-72 chars and may not contain spaces, quotes, semicolons, or angle brackets")
	}
	hasLetter := regexp.MustCompile(`[A-Za-z]`).MatchString(password)
	hasNumber := regexp.MustCompile(`[0-9]`).MatchString(password)
	if !hasLetter || !hasNumber {
		return fmt.Errorf("password must contain both letters and numbers")
	}
	return nil
}

func avatarExtension(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/webp":
		return ".webp", true
	default:
		return "", false
	}
}
