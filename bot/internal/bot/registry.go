package bot

import (
	"sync"
)

type chatRegistry struct {
	mu    sync.Mutex
	chats map[int64]int64 // telegram user id → chat id
}

func newChatRegistry() *chatRegistry {
	return &chatRegistry{chats: make(map[int64]int64)}
}

func (r *chatRegistry) remember(telegramUserID, chatID int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.chats[telegramUserID] = chatID
}

func (r *chatRegistry) snapshot() map[int64]int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[int64]int64, len(r.chats))
	for userID, chatID := range r.chats {
		out[userID] = chatID
	}
	return out
}

type sentReminders struct {
	mu   sync.Mutex
	keys map[string]struct{}
}

func newSentReminders() *sentReminders {
	return &sentReminders{keys: make(map[string]struct{})}
}

func (s *sentReminders) seenOrMark(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.keys[key]; ok {
		return true
	}
	s.keys[key] = struct{}{}
	return false
}
