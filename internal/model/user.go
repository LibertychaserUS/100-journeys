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
	AvatarURL    string    `json:"avatar_url,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// IsAdmin returns true if the user has admin role.
func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// RegisterRequest holds incoming registration payload.
type RegisterRequest struct {
	Username string `json:"username" binding:"required,min=3,max=30"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

// LoginRequest holds incoming login payload.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
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
