package bot

import (
	"sync"
)

type botRole string

const (
	roleUnknown botRole = ""
	roleTutor   botRole = "tutor"
	roleStudent botRole = "student"
)

type pendingAction string

const (
	pendingNone pendingAction = ""
	pendingLink pendingAction = "link"
)

type chatEntry struct {
	chatID  int64
	role    botRole
	pending pendingAction
}

type chatRegistry struct {
	mu    sync.Mutex
	chats map[int64]chatEntry // telegram user id → entry
}

func newChatRegistry() *chatRegistry {
	return &chatRegistry{chats: make(map[int64]chatEntry)}
}

func (r *chatRegistry) remember(telegramUserID, chatID int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.chats[telegramUserID]
	entry.chatID = chatID
	r.chats[telegramUserID] = entry
}

func (r *chatRegistry) setRole(telegramUserID int64, role botRole) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.chats[telegramUserID]
	entry.role = role
	r.chats[telegramUserID] = entry
}

func (r *chatRegistry) role(telegramUserID int64) botRole {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.chats[telegramUserID].role
}

func (r *chatRegistry) pending(telegramUserID int64) pendingAction {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.chats[telegramUserID].pending
}

func (r *chatRegistry) setPending(telegramUserID int64, action pendingAction) {
	r.mu.Lock()
	defer r.mu.Unlock()
	entry := r.chats[telegramUserID]
	entry.pending = action
	r.chats[telegramUserID] = entry
}

func (r *chatRegistry) clearPending(telegramUserID int64) {
	r.setPending(telegramUserID, pendingNone)
}

func (r *chatRegistry) snapshot() map[int64]int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[int64]int64, len(r.chats))
	for userID, entry := range r.chats {
		out[userID] = entry.chatID
	}
	return out
}

func (r *chatRegistry) snapshotEntries() map[int64]chatEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[int64]chatEntry, len(r.chats))
	for userID, entry := range r.chats {
		out[userID] = entry
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
