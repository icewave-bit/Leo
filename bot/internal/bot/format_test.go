package bot

import (
	"testing"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
	"github.com/stretchr/testify/assert"
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
	assert.Equal(t, "Уроки на сегодня\nНет уроков", b.formatSchedule("Уроки на сегодня", tutorapi.Schedule{}))
}

func TestFormatInZone_convertsUTCToTutorTimezone(t *testing.T) {
	// 14:00 UTC is 17:00 in Europe/Moscow (UTC+3).
	assert.Equal(t, "17:00", formatInZone("2026-07-20T14:00:00Z", "Europe/Moscow", "15:04"))
	assert.Equal(t, "Mon 20.07 17:00", formatInZone("2026-07-20T14:00:00Z", "Europe/Moscow", "Mon 02.01 15:04"))
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
