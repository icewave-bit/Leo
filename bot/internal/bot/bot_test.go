package bot

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"

	telegram "github.com/go-telegram/bot"
	"github.com/go-telegram/bot/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

type mockMessenger struct {
	mu       sync.Mutex
	sent     []*telegram.SendRichMessageParams
	edited   []*telegram.EditMessageTextParams
	answered []string
	sendErr  error
}

func (m *mockMessenger) SendMessage(_ context.Context, _ *telegram.SendMessageParams) (*models.Message, error) {
	return &models.Message{ID: 1}, nil
}

func (m *mockMessenger) SendRichMessage(_ context.Context, params *telegram.SendRichMessageParams) (*models.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sent = append(m.sent, params)
	if m.sendErr != nil {
		return nil, m.sendErr
	}
	return &models.Message{ID: 1}, nil
}

func (m *mockMessenger) EditMessageText(_ context.Context, params *telegram.EditMessageTextParams) (*models.Message, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.edited = append(m.edited, params)
	return &models.Message{ID: params.MessageID}, nil
}

func (m *mockMessenger) AnswerCallbackQuery(_ context.Context, params *telegram.AnswerCallbackQueryParams) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.answered = append(m.answered, params.CallbackQueryID)
	return true, nil
}

func (m *mockMessenger) Start(ctx context.Context) {
	<-ctx.Done()
}

func (m *mockMessenger) messages() []*telegram.SendRichMessageParams {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*telegram.SendRichMessageParams, len(m.sent))
	copy(out, m.sent)
	return out
}

func (m *mockMessenger) edits() []*telegram.EditMessageTextParams {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]*telegram.EditMessageTextParams, len(m.edited))
	copy(out, m.edited)
	return out
}

type mockMonitor struct {
	linkIn          tutorapi.LinkInput
	today           tutorapi.Schedule
	studentToday    tutorapi.Schedule
	due             []tutorapi.DueReminder
	dueErr          error
	markedSent      []tutorapi.SentReminder
	todayCalled     bool
	notLink         bool
	linkErr         error
	registerErr     error
	student         *tutorapi.BotStudent
	studentBalance  *tutorapi.StudentBalance
	openSlots       *tutorapi.OpenSlots
	openSlotsOffset []int
	telegramNotify  *tutorapi.TelegramNotify
	registerIn      tutorapi.StudentRegisterInput
}

func defaultTelegramNotify() tutorapi.TelegramNotify {
	return tutorapi.TelegramNotify{
		Enabled:     true,
		LeadMinutes: 30,
		Silent:      false,
		Lessons:     true,
		Personal:    false,
	}
}

func (m *mockMonitor) tutorNotify() tutorapi.TelegramNotify {
	if m.telegramNotify != nil {
		return *m.telegramNotify
	}
	return defaultTelegramNotify()
}

func (m *mockMonitor) Link(_ context.Context, in tutorapi.LinkInput) (tutorapi.Tutor, error) {
	m.linkIn = in
	if m.linkErr != nil {
		return tutorapi.Tutor{}, m.linkErr
	}
	return tutorapi.Tutor{Name: "Anna", Timezone: "Europe/Minsk"}, nil
}

func (m *mockMonitor) Me(_ context.Context, _ int64) (tutorapi.Tutor, error) {
	if m.notLink {
		return tutorapi.Tutor{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.Tutor{
		Name:           "Anna",
		Timezone:       "Europe/Minsk",
		TelegramNotify: m.tutorNotify(),
	}, nil
}

func (m *mockMonitor) Today(_ context.Context, _ int64) (tutorapi.Schedule, error) {
	m.todayCalled = true
	if m.notLink {
		return tutorapi.Schedule{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return m.today, nil
}

func (m *mockMonitor) Tomorrow(_ context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.Today(context.Background(), telegramUserID)
}

func (m *mockMonitor) Week(_ context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.Today(context.Background(), telegramUserID)
}

func (m *mockMonitor) OpenSlots(_ context.Context, _ int64, weekOffset int) (tutorapi.OpenSlots, error) {
	m.openSlotsOffset = append(m.openSlotsOffset, weekOffset)
	if m.openSlots != nil {
		return *m.openSlots, nil
	}
	if m.notLink {
		return tutorapi.OpenSlots{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.OpenSlots{Timezone: "UTC", Days: nil}, nil
}

func (m *mockMonitor) Students(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func (m *mockMonitor) Debt(_ context.Context, _ int64) ([]tutorapi.Student, error) {
	return nil, nil
}

func (m *mockMonitor) DueReminders(_ context.Context) ([]tutorapi.DueReminder, error) {
	if m.dueErr != nil {
		return nil, m.dueErr
	}
	return m.due, nil
}

func (m *mockMonitor) MarkRemindersSent(_ context.Context, items []tutorapi.SentReminder) error {
	m.markedSent = append(m.markedSent, items...)
	return nil
}

func (m *mockMonitor) RegisterStudent(_ context.Context, in tutorapi.StudentRegisterInput) (tutorapi.BotStudent, error) {
	m.registerIn = in
	if m.registerErr != nil {
		return tutorapi.BotStudent{}, m.registerErr
	}
	if m.student != nil {
		return *m.student, nil
	}
	return tutorapi.BotStudent{
		Name:      "Leo",
		TutorName: "Anna",
		Timezone:  "Europe/Minsk",
		Balance: tutorapi.StudentBalance{
			Prepaid:     10,
			Debt:        0,
			Currency:    "EUR",
			BalanceKind: "money",
		},
	}, nil
}

func (m *mockMonitor) StudentMe(_ context.Context, _ int64) (tutorapi.BotStudent, error) {
	if m.student != nil {
		return *m.student, nil
	}
	if m.notLink {
		return tutorapi.BotStudent{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
	}
	return tutorapi.BotStudent{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentWeek(ctx context.Context, telegramUserID int64) (tutorapi.Schedule, error) {
	return m.StudentToday(ctx, telegramUserID)
}

func (m *mockMonitor) StudentToday(_ context.Context, _ int64) (tutorapi.Schedule, error) {
	if m.student != nil || m.studentToday.Timezone != "" || len(m.studentToday.Lessons) > 0 {
		if m.studentToday.Timezone == "" {
			out := m.studentToday
			out.Timezone = "UTC"
			return out, nil
		}
		return m.studentToday, nil
	}
	return tutorapi.Schedule{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentBalance(_ context.Context, _ int64) (tutorapi.StudentBalance, error) {
	if m.studentBalance != nil {
		return *m.studentBalance, nil
	}
	if m.student != nil {
		return m.student.Balance, nil
	}
	return tutorapi.StudentBalance{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func (m *mockMonitor) StudentOpenSlots(_ context.Context, _ int64, weekOffset int) (tutorapi.OpenSlots, error) {
	m.openSlotsOffset = append(m.openSlotsOffset, weekOffset)
	if m.openSlots != nil {
		return *m.openSlots, nil
	}
	return tutorapi.OpenSlots{}, &tutorapi.Error{Code: "TELEGRAM_NOT_LINKED", Message: "not linked", Status: 403}
}

func newTestBot(api TelegramClient, monitor Monitor) *Bot {
	b, err := New(Config{
		TelegramClient: api,
		Monitor:        monitor,
		Logger:         slog.New(slog.NewTextHandler(io.Discard, nil)),
		PollInterval:   0,
	})
	if err != nil {
		panic(err)
	}
	return b
}

func TestHandleUpdate_help(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/help",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))
	require.Len(t, msg.messages(), 1)
	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "/today")
	assert.Contains(t, out.RichMessage.Markdown, "/tomorrow")
	assert.Contains(t, out.RichMessage.Markdown, "/slots")
	assert.Contains(t, out.RichMessage.Markdown, "/students")
	assert.Contains(t, out.RichMessage.Markdown, "/debt")
	assert.NotContains(t, out.RichMessage.Markdown, "/balance")
	assert.NotContains(t, out.RichMessage.Markdown, "/start")
}

func TestHandleUpdate_guestHelp_onlyLinkCommands(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{notLink: true})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/help",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "/start")
	assert.Contains(t, out.RichMessage.Markdown, "/link")
	assert.NotContains(t, out.RichMessage.Markdown, "/today")
	assert.NotContains(t, out.RichMessage.Markdown, "/students")
	assert.NotContains(t, out.RichMessage.Markdown, "/balance")
}

func TestHandleUpdate_link(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/link ab12",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	assert.Equal(t, "ab12", mon.linkIn.Code)
	assert.Equal(t, int64(99), mon.linkIn.TelegramUserID)
	assert.Equal(t, "fedor", mon.linkIn.TelegramUsername)

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Anna")
}

func TestHandleUpdate_notLinked(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{notLink: true})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Привязать")
}

func TestHandleUpdate_today(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T10:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today@For_Leo_Bot",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "На сегодня")
	assert.Contains(t, out.RichMessage.Markdown, "Leo")
	assert.NotContains(t, out.RichMessage.Markdown, "запланирован")
	assert.NotContains(t, out.RichMessage.Markdown, "оплачен")
	require.IsType(t, &models.ReplyKeyboardMarkup{}, out.ReplyMarkup)
}

func TestHandleUpdate_todayIncludesPersonalEvents(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T12:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
			Events: []tutorapi.PersonalEvent{{
				StartUTC:    "2026-07-20T09:00:00Z",
				Title:       "Yoga",
				GroupName:   "Здоровье",
				DurationMin: 45,
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/today",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Yoga")
	assert.Contains(t, out.RichMessage.Markdown, "Leo")
}

func TestHandleUpdate_tomorrow(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-21T10:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnTomorrow,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "На завтра")
	assert.Contains(t, out.RichMessage.Markdown, "Leo")
	kb, ok := out.ReplyMarkup.(*models.ReplyKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, btnTomorrow, kb.Keyboard[0][1].Text)
	assert.Equal(t, btnSlots, kb.Keyboard[1][1].Text)
}

func TestHandleUpdate_tutorSlots_asksWeek(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		openSlots: &tutorapi.OpenSlots{
			Timezone: "UTC",
			Days: []tutorapi.OpenSlotsDay{{
				Date: "2026-07-21",
				Ranges: []tutorapi.OpenSlotRange{
					{StartHour: 10, EndHour: 12},
				},
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnSlots,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Какую неделю")
	assert.NotContains(t, out.RichMessage.Markdown, "10:00")
	kb, ok := out.ReplyMarkup.(*models.InlineKeyboardMarkup)
	require.True(t, ok)
	require.Len(t, kb.InlineKeyboard, 1)
	require.Len(t, kb.InlineKeyboard[0], 2)
	assert.Equal(t, "Эта неделя", kb.InlineKeyboard[0][0].Text)
	assert.Equal(t, "slots:0", kb.InlineKeyboard[0][0].CallbackData)
	assert.Equal(t, "Следующая", kb.InlineKeyboard[0][1].Text)
	assert.Equal(t, "slots:1", kb.InlineKeyboard[0][1].CallbackData)
}

func TestHandleCallback_slotsThisWeek(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{
		openSlots: &tutorapi.OpenSlots{
			Timezone: "UTC",
			Days: []tutorapi.OpenSlotsDay{{
				Date: "2026-07-21",
				Ranges: []tutorapi.OpenSlotRange{
					{StartHour: 10, EndHour: 12},
				},
			}},
		},
	}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		CallbackQuery: &models.CallbackQuery{
			ID:   "cb1",
			From: models.User{ID: 1},
			Data: "slots:0",
			Message: models.MaybeInaccessibleMessage{
				Type: models.MaybeInaccessibleMessageTypeMessage,
				Message: &models.Message{
					ID:   9,
					Chat: models.Chat{ID: 7},
				},
			},
		},
	}))

	require.Equal(t, []int{0}, mon.openSlotsOffset)
	require.Len(t, msg.edits(), 1)
	edit := msg.edits()[0]
	require.NotNil(t, edit.RichMessage)
	assert.Empty(t, edit.Text)
	assert.Equal(t, int64(7), edit.ChatID)
	assert.Equal(t, 9, edit.MessageID)
	assert.Contains(t, edit.RichMessage.Markdown, "эта неделя")
	assert.Contains(t, edit.RichMessage.Markdown, "10:00")
	kb, ok := edit.ReplyMarkup.(*models.InlineKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, cbSlotsPick, kb.InlineKeyboard[0][0].CallbackData)
	assert.Equal(t, "slots:1", kb.InlineKeyboard[0][1].CallbackData)
	assert.Equal(t, []string{"cb1"}, msg.answered)
}

func TestHandleCallback_slotsNextWeekThenBack(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{openSlots: &tutorapi.OpenSlots{Timezone: "UTC"}}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		CallbackQuery: &models.CallbackQuery{
			ID:   "cb2",
			From: models.User{ID: 1},
			Data: "slots:1",
			Message: models.MaybeInaccessibleMessage{
				Type:    models.MaybeInaccessibleMessageTypeMessage,
				Message: &models.Message{ID: 9, Chat: models.Chat{ID: 7}},
			},
		},
	}))
	require.Equal(t, []int{1}, mon.openSlotsOffset)
	assert.Contains(t, msg.edits()[0].RichMessage.Markdown, "следующая неделя")

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		CallbackQuery: &models.CallbackQuery{
			ID:   "cb3",
			From: models.User{ID: 1},
			Data: cbSlotsPick,
			Message: models.MaybeInaccessibleMessage{
				Type:    models.MaybeInaccessibleMessageTypeMessage,
				Message: &models.Message{ID: 9, Chat: models.Chat{ID: 7}},
			},
		},
	}))
	assert.Equal(t, slotsPickerText, msg.edits()[1].RichMessage.Markdown)
	kb, ok := msg.edits()[1].ReplyMarkup.(*models.InlineKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, "slots:0", kb.InlineKeyboard[0][0].CallbackData)
}

func TestHandleUpdate_buttonToday(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		today: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T10:00:00Z",
				DurationMin: 60,
				Status:      "planned",
				StudentName: "Leo",
			}},
		},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnToday,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Leo")
	require.IsType(t, &models.ReplyKeyboardMarkup{}, out.ReplyMarkup)
}

func TestHandleUpdate_buttonLinkPrompt(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "код")
	assert.Equal(t, pendingLink, b.chats.pending(1))
}

func TestHandleUpdate_linkTwoStep(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))
	require.Len(t, msg.messages(), 1)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "ab12",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	assert.Equal(t, "ab12", mon.linkIn.Code)
	assert.Equal(t, int64(99), mon.linkIn.TelegramUserID)
	assert.Equal(t, "fedor", mon.linkIn.TelegramUsername)
	assert.Equal(t, pendingNone, b.chats.pending(99))
	assert.Equal(t, roleTutor, b.chats.role(99))

	out := msg.messages()[1]
	assert.Contains(t, out.RichMessage.Markdown, "Anna")
}

func TestHandleUpdate_linkTwoStep_failureStillReplies(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		linkErr: &tutorapi.Error{Code: "NOT_FOUND", Message: "Link code not found", Status: 404},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: btnLink,
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "bad99",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 99, Username: "fedor"},
		},
	}))

	require.Len(t, msg.messages(), 2)
	out := msg.messages()[1]
	assert.NotEmpty(t, out.RichMessage.Markdown)
	assert.Equal(t, pendingLink, b.chats.pending(99))
}

func TestHandleUpdate_remembersChat(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/help",
			Chat: models.Chat{ID: 42},
			From: &models.User{ID: 7},
		},
	}))

	chats := b.chats.snapshot()
	assert.Equal(t, int64(42), chats[7])
}

func TestHandleUpdate_ignoresNonCommand(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "hello",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1},
		},
	}))
	assert.Empty(t, msg.messages())
	assert.Equal(t, int64(7), b.chats.snapshot()[1])
}

func TestHandleUpdate_studentStart(t *testing.T) {
	msg := &mockMessenger{}
	mon := &mockMonitor{
		notLink: true,
		student: &tutorapi.BotStudent{
			Name:      "Leo",
			TutorName: "Anna",
			Timezone:  "UTC",
			Balance:   tutorapi.StudentBalance{Prepaid: 5, Currency: "EUR", BalanceKind: "money"},
		},
	}
	b := newTestBot(msg, mon)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/start",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 55, Username: "leo_student"},
		},
	}))

	assert.Equal(t, "leo_student", mon.registerIn.TelegramUsername)
	assert.Equal(t, roleStudent, b.chats.role(55))
	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Leo")
	assert.Contains(t, out.RichMessage.Markdown, "/balance")
	assert.Contains(t, out.RichMessage.Markdown, "/today")
	assert.Contains(t, out.RichMessage.Markdown, "/slots")
	assert.NotContains(t, out.RichMessage.Markdown, "/students")
	assert.NotContains(t, out.RichMessage.Markdown, "/debt")
	assert.NotContains(t, out.RichMessage.Markdown, "/tomorrow")
	assert.NotContains(t, out.RichMessage.Markdown, "/link")
	kb, ok := out.ReplyMarkup.(*models.ReplyKeyboardMarkup)
	require.True(t, ok)
	assert.Equal(t, btnBalance, kb.Keyboard[1][1].Text)
	assert.Equal(t, btnSlots, kb.Keyboard[1][0].Text)
}

func TestHandleUpdate_studentStartNotFound(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		notLink:     true,
		registerErr: &tutorapi.Error{Code: "NOT_FOUND", Message: "Student not found", Status: 404},
	})

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/start",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 55, Username: "unknown_user"},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "не найден")
}

func TestHandleUpdate_studentWeek(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{
		notLink: true,
		student: &tutorapi.BotStudent{Name: "Leo", TutorName: "Anna", Timezone: "UTC"},
		studentToday: tutorapi.Schedule{
			Timezone: "UTC",
			Lessons: []tutorapi.Lesson{{
				StartUTC:    "2026-07-20T14:00:00Z",
				DurationMin: 60,
				Status:      "planned",
			}},
		},
	})
	b.chats.setRole(1, roleStudent)

	require.NoError(t, b.handleUpdate(context.Background(), &models.Update{
		Message: &models.Message{
			Text: "/week",
			Chat: models.Chat{ID: 7},
			From: &models.User{ID: 1, Username: "leo"},
		},
	}))

	out := msg.messages()[0]
	assert.Contains(t, out.RichMessage.Markdown, "Уроки на неделю")
	assert.NotContains(t, out.RichMessage.Markdown, "запланирован")
	assert.NotContains(t, out.RichMessage.Markdown, "оплачен")
	assert.NotContains(t, out.RichMessage.Markdown, "— Leo")
}

func TestRun_stopsOnContextCancel(t *testing.T) {
	msg := &mockMessenger{}
	b := newTestBot(msg, &mockMonitor{})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() {
		done <- b.Run(ctx)
	}()

	time.Sleep(10 * time.Millisecond)
	cancel()

	select {
	case err := <-done:
		assert.ErrorIs(t, err, context.Canceled)
	case <-time.After(time.Second):
		t.Fatal("run did not stop after context cancel")
	}
}

func TestParseCommand(t *testing.T) {
	cmd, arg := parseCommand("/link@Bot AB12")
	assert.Equal(t, "/link", cmd)
	assert.Equal(t, "AB12", arg)
}

func TestResolveInput(t *testing.T) {
	cmd, arg := resolveInput(btnWeek)
	assert.Equal(t, "/week", cmd)
	assert.Equal(t, "", arg)

	cmd, arg = resolveInput(btnTomorrow)
	assert.Equal(t, "/tomorrow", cmd)

	cmd, arg = resolveInput(btnSlots)
	assert.Equal(t, "/slots", cmd)

	cmd, arg = resolveInput("/link@Bot AB12")
	assert.Equal(t, "/link", cmd)
	assert.Equal(t, "AB12", arg)

	cmd, arg = resolveInput("hello")
	assert.Equal(t, "", cmd)
	assert.Equal(t, "", arg)
}

func TestNew_requiresTelegramClientOrToken(t *testing.T) {
	_, err := New(Config{
		Monitor: &mockMonitor{},
		Logger:  slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	require.Error(t, err)
}
