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
