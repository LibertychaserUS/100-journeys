package model

import "time"

// Role constants for user system.
const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

// User represents a registered account.
type User struct {
	ID           int64     `json:"id"`
	Username     string    `json:"username"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // never expose in JSON
	Role         string    `json:"role"`
	Level        int       `json:"level"`
	Points       int       `json:"points"`
	Balance      int       `json:"balance"`
	MBTIType     string    `json:"mbti_type,omitempty"`
	Gender       string    `json:"gender,omitempty"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	AgeBand      string    `json:"age_band"` // declared at sign-up: under14, 14-17 or 18+ ('' for older accounts)
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// IsAdmin returns true if the user has admin role.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// AgeBands are the self-declared age bands (no birth year is asked for).
var AgeBands = []string{"under14", "14-17", "18+"}

// RegisterRequest holds incoming registration payload.
type RegisterRequest struct {
	Username      string `json:"username" binding:"required,min=2,max=30"`
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required,min=6"`
	Gender        string `json:"gender" binding:"required,oneof=female male non_binary prefer_not_to_say"`
	AgeBand       string `json:"age_band" binding:"omitempty,oneof=under14 14-17 18+"`
	CaptchaID     string `json:"captcha_id" binding:"required"`
	CaptchaAnswer string `json:"captcha_answer" binding:"required"`
}

// LoginRequest holds incoming login payload.
type LoginRequest struct {
	Email         string `json:"email" binding:"required,email"`
	Password      string `json:"password" binding:"required"`
	CaptchaID     string `json:"captcha_id" binding:"required"`
	CaptchaAnswer string `json:"captcha_answer" binding:"required"`
}

// AuthResponse is returned on successful register/login.
type AuthResponse struct {
	Token     string `json:"token"`
	ExpiresIn int64  `json:"expires_in"` // seconds
	User      User   `json:"user"`
}

// PointsHistory tracks point transactions.
type PointsHistory struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	ActionType   string    `json:"action_type"`
	PointsDelta  int       `json:"points_delta"`
	BalanceAfter int       `json:"balance_after"`
	Description  string    `json:"description,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
}

// SavedJourney represents a user's bookmark.
type SavedJourney struct {
	UserID    int64     `json:"user_id"`
	JourneyID int64     `json:"journey_id"`
	CreatedAt time.Time `json:"created_at"`
}
