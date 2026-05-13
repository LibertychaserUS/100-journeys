package eventbus

import "sync"

// Event represents a domain event.
type Event struct {
	Type string
	Data map[string]interface{}
}

// Handler is a function that processes events.
type Handler func(Event)

// Bus is a simple in-memory pub/sub event bus.
type Bus struct {
	mu        sync.RWMutex
	subscribers map[string][]Handler
}

// New creates a new event bus.
func New() *Bus {
	return &Bus{
		subscribers: make(map[string][]Handler),
	}
}

// Subscribe registers a handler for an event type.
func (b *Bus) Subscribe(eventType string, h Handler) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.subscribers[eventType] = append(b.subscribers[eventType], h)
}

// Publish sends an event to all subscribers asynchronously.
func (b *Bus) Publish(eventType string, data map[string]interface{}) {
	b.mu.RLock()
	handlers := make([]Handler, len(b.subscribers[eventType]))
	copy(handlers, b.subscribers[eventType])
	b.mu.RUnlock()

	evt := Event{Type: eventType, Data: data}
	for _, h := range handlers {
		go h(evt)
	}
}

// Common event types.
const (
	UserRegistered = "user.registered"
	OrderPaid      = "order.paid"
)

// Default is the global event bus instance.
var Default = New()
