package bot

import (
	"fmt"
	"strings"
	"time"

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func (b *Bot) formatTutor(t tutorapi.Tutor) string {
	return fmt.Sprintf("%s\nЧасовой пояс: %s\n%s", t.Name, t.Timezone, formatNotifySummary(t.TelegramNotify))
}

func formatNotifySummary(n tutorapi.TelegramNotify) string {
	if !n.Enabled {
		return "Уведомления: выкл"
	}
	sound := "со звуком"
	if n.Silent {
		sound = "без звука"
	}
	return fmt.Sprintf("Уведомления: вкл, за %s, %s",
		formatLead(time.Duration(n.LeadMinutes)*time.Minute),
		sound,
	)
}

func (b *Bot) formatSchedule(title string, schedule tutorapi.Schedule) string {
	if len(schedule.Lessons) == 0 {
		return title + "\nНет уроков"
	}

	var buf strings.Builder
	buf.WriteString(title)
	for _, lesson := range schedule.Lessons {
		buf.WriteByte('\n')
		buf.WriteString(b.formatLessonLine(lesson, schedule.Timezone))
	}
	return buf.String()
}

func (b *Bot) formatLessonLine(lesson tutorapi.Lesson, timezone string) string {
	when := formatInZone(lesson.StartUTC, timezone, "Mon 02.01 15:04")
	paid := "не оплачен"
	if lesson.Paid {
		paid = "оплачен"
	}
	return fmt.Sprintf("• %s — %s (%s, %d мин, %s)",
		when,
		lesson.StudentName,
		lessonStatusRU(lesson.Status),
		lesson.DurationMin,
		paid,
	)
}

func (b *Bot) formatStudents(title string, students []tutorapi.Student) string {
	if len(students) == 0 {
		return title + "\nСписок пуст"
	}

	var buf strings.Builder
	buf.WriteString(title)
	for _, s := range students {
		buf.WriteByte('\n')
		buf.WriteString(b.formatStudentLine(s))
	}
	return buf.String()
}

func (b *Bot) formatStudentLine(s tutorapi.Student) string {
	unit := "у.е."
	if s.BalanceKind == "lessons" {
		unit = "ур."
	} else if s.Currency != "" {
		unit = s.Currency
	}

	line := fmt.Sprintf("• %s — предоплата %.2f %s, долг %.2f %s",
		s.Name, s.Prepaid, unit, s.Debt, unit)
	if s.OpenLessonDebt > 0 {
		line += fmt.Sprintf(", открытый долг по урокам %.2f %s", s.OpenLessonDebt, unit)
	}
	return line
}

func formatInZone(startUTC, timezone, layout string) string {
	t, err := time.Parse(time.RFC3339, startUTC)
	if err != nil {
		return startUTC
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	return t.In(loc).Format(layout)
}

func lessonStatusRU(status string) string {
	switch status {
	case "planned":
		return "запланирован"
	case "completed":
		return "проведён"
	case "cancelled":
		return "отменён"
	case "no_show":
		return "неявка"
	default:
		return status
	}
}
