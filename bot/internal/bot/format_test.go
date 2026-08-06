package bot

import (
	"strings"
	"testing"
	"time"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFormatTutor_notifyEnabled(t *testing.T) {
	b := &Bot{}
	text := b.formatTutor(tutorapi.Tutor{
		Name:     "Anna",
		Timezone: "Europe/Minsk",
		TelegramNotify: tutorapi.TelegramNotify{
			Enabled:     true,
			LeadMinutes: 30,
			Silent:      false,
		},
	})
	assert.Contains(t, text, "Anna")
	assert.Contains(t, text, "Уведомления: вкл, за 30 мин, со звуком")
}

func TestFormatTutor_notifyDisabled(t *testing.T) {
	b := &Bot{}
	text := b.formatTutor(tutorapi.Tutor{
		Name:     "Anna",
		Timezone: "Europe/Minsk",
		TelegramNotify: tutorapi.TelegramNotify{
			Enabled: false,
		},
	})
	assert.Contains(t, text, "Уведомления: выкл")
}

func TestFormatSchedule_empty(t *testing.T) {
	b := &Bot{}
	assert.Equal(t, "На сегодня\nНет записей", b.formatSchedule("На сегодня", tutorapi.Schedule{}))
}

func TestFormatSchedule_interleavesPersonalEvents(t *testing.T) {
	b := &Bot{}
	text := b.formatSchedule("На сегодня", tutorapi.Schedule{
		Timezone: "UTC",
		Lessons: []tutorapi.Lesson{{
			StartUTC:    "2026-07-20T12:00:00Z",
			StudentName: "Leo",
			Status:      "planned",
			DurationMin: 60,
		}},
		Events: []tutorapi.PersonalEvent{{
			StartUTC:    "2026-07-20T10:00:00Z",
			Title:       "Yoga",
			GroupName:   "Здоровье",
			DurationMin: 45,
		}},
	})
	assert.Contains(t, text, "Yoga")
	assert.Contains(t, text, "Здоровье")
	assert.Contains(t, text, "Leo")
	yogaIdx := strings.Index(text, "Yoga")
	leoIdx := strings.Index(text, "Leo")
	assert.Greater(t, leoIdx, yogaIdx)
}

func TestFormatLessonReminder_includesMeetURL(t *testing.T) {
	b := &Bot{}
	meet := "https://meet.google.com/abc-defg-hij"
	lesson := tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Leo",
		MeetURL:     &meet,
	}
	tutorText := b.formatLessonReminder(lesson, "Europe/Moscow", 30*time.Minute, false)
	assert.Contains(t, tutorText, "урок с Leo")
	assert.Contains(t, tutorText, "17:00")
	assert.NotContains(t, tutorText, meet)

	studentText := b.formatLessonReminder(lesson, "Europe/Moscow", 30*time.Minute, true)
	assert.Contains(t, studentText, "урок (17:00)")
	assert.NotContains(t, studentText, "с Leo")
	assert.NotContains(t, studentText, meet)

	kb := meetJoinKeyboard(meet)
	require.NotNil(t, kb)
	require.Len(t, kb.InlineKeyboard, 1)
	require.Len(t, kb.InlineKeyboard[0], 1)
	assert.Equal(t, "Подключиться", kb.InlineKeyboard[0][0].Text)
	assert.Equal(t, meet, kb.InlineKeyboard[0][0].URL)
}

func TestFormatLessonReminder_omitsEmptyMeetURL(t *testing.T) {
	b := &Bot{}
	text := b.formatLessonReminder(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Leo",
	}, "UTC", 15*time.Minute, false)
	assert.Equal(t, "Напоминание: через 15 мин урок с Leo (14:00)", text)
	assert.Nil(t, meetJoinKeyboard(""))
}

func TestFormatLessonLine_usesTimezone(t *testing.T) {
	b := &Bot{}
	line := b.formatLessonLine(tutorapi.Lesson{
		StartUTC:     "2026-07-20T14:00:00Z",
		StudentName:  "Ivan",
		Status:       "planned",
		DurationMin:  60,
		Paid:         true,
	}, "Europe/Moscow")
	assert.Contains(t, line, "17:00")
	assert.NotContains(t, line, "14:00")
}

func TestFormatStudentLine_money(t *testing.T) {
	b := &Bot{}
	line := b.formatStudentLine(tutorapi.Student{
		Name:        "Anna",
		Currency:    "EUR",
		BalanceKind: "money",
		Prepaid:     10,
		Debt:        2.5,
	})
	assert.Contains(t, line, "Anna")
	assert.Contains(t, line, "EUR")
}
