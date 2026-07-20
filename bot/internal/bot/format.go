package bot

import (
	"fmt"
	"strings"
	"time"
	_ "time/tzdata" // IANA zones for Alpine/scratch images without OS tzdata

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

func (b *Bot) formatBotStudent(s tutorapi.BotStudent) string {
	return fmt.Sprintf("%s\nРепетитор: %s\nЧасовой пояс: %s\n%s",
		s.Name, s.TutorName, s.Timezone, b.formatBalance(s.Balance))
}

func (b *Bot) formatBalance(bal tutorapi.StudentBalance) string {
	unit := "у.е."
	if bal.BalanceKind == "lessons" {
		unit = "ур."
	} else if bal.Currency != "" {
		unit = bal.Currency
	}
	line := fmt.Sprintf("Баланс: предоплата %.2f %s, долг %.2f %s", bal.Prepaid, unit, bal.Debt, unit)
	if bal.OpenLessonDebt > 0 {
		line += fmt.Sprintf("\nОткрытый долг по урокам: %.2f %s", bal.OpenLessonDebt, unit)
	}
	if bal.BillingShared {
		line += "\n(общий счёт семьи)"
	}
	return line
}

func (b *Bot) formatStudentSchedule(title string, schedule tutorapi.Schedule) string {
	if len(schedule.Lessons) == 0 {
		return title + "\nНет уроков"
	}

	var buf strings.Builder
	buf.WriteString(title)
	for _, lesson := range schedule.Lessons {
		buf.WriteByte('\n')
		when := formatInZone(lesson.StartUTC, schedule.Timezone, "Mon 02.01 15:04")
		paid := "не оплачен"
		if lesson.Paid {
			paid = "оплачен"
		}
		buf.WriteString(fmt.Sprintf("• %s — %s, %d мин, %s",
			when, lessonStatusRU(lesson.Status), lesson.DurationMin, paid))
	}
	return buf.String()
}

func (b *Bot) formatOpenSlots(slots tutorapi.OpenSlots) string {
	if len(slots.Days) == 0 {
		return "Свободные слоты\nНет данных"
	}

	var buf strings.Builder
	buf.WriteString("Свободные слоты на неделю")
	any := false
	for _, day := range slots.Days {
		if len(day.Ranges) == 0 {
			continue
		}
		any = true
		buf.WriteByte('\n')
		label := formatDateLabel(day.Date, slots.Timezone)
		parts := make([]string, 0, len(day.Ranges))
		for _, r := range day.Ranges {
			endLabel := fmt.Sprintf("%02d:00", r.EndHour)
			if r.EndHour == 24 {
				endLabel = "24:00"
			}
			parts = append(parts, fmt.Sprintf("%02d:00–%s", r.StartHour, endLabel))
		}
		buf.WriteString(fmt.Sprintf("%s: %s", label, strings.Join(parts, ", ")))
	}
	if !any {
		return "Свободные слоты на неделю\nНет свободных часов"
	}
	return buf.String()
}

func formatDateLabel(date, timezone string) string {
	t, err := time.ParseInLocation("2006-01-02", date, time.UTC)
	if err != nil {
		return date
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	// date is a calendar date in tutor TZ; format weekday+date without shifting.
	_ = loc
	return t.Format("Mon 02.01")
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
