package bot

import (
	"fmt"
	"sort"
	"strings"
	"time"
	_ "time/tzdata" // IANA zones for Alpine/scratch images without OS tzdata

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

func (b *Bot) formatTutor(t tutorapi.Tutor) string {
	return mdHeading(t.Name) + "\n\nЧасовой пояс: " + mdEscape(t.Timezone) + "\n\n" + formatNotifySummary(t.TelegramNotify)
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
	type item struct {
		start string
		line  string
	}
	items := make([]item, 0, len(schedule.Lessons)+len(schedule.Events))
	for _, lesson := range schedule.Lessons {
		items = append(items, item{
			start: lesson.StartUTC,
			line:  b.formatLessonLine(lesson, schedule.Timezone),
		})
	}
	for _, event := range schedule.Events {
		items = append(items, item{
			start: event.StartUTC,
			line:  b.formatPersonalEventLine(event, schedule.Timezone),
		})
	}
	if len(items) == 0 {
		return mdHeading(title) + "\n\nНет записей"
	}

	sort.SliceStable(items, func(i, j int) bool {
		return items[i].start < items[j].start
	})

	var buf strings.Builder
	buf.WriteString(mdHeading(title))
	buf.WriteByte('\n')
	for _, it := range items {
		buf.WriteByte('\n')
		buf.WriteString(it.line)
	}
	return buf.String()
}

func (b *Bot) formatLessonLine(lesson tutorapi.Lesson, timezone string) string {
	when := mdDateTime(lesson.StartUTC, timezone, "Mon 02.01 15:04", "wdt")
	paid := "оплачен"
	if !lesson.Paid {
		paid = "==не оплачен=="
	}
	line := fmt.Sprintf("- %s — **%s** (%s, %d мин, %s)",
		when,
		mdEscape(lesson.StudentName),
		lessonStatusRU(lesson.Status),
		lesson.DurationMin,
		paid,
	)
	if lesson.Status == "cancelled" || lesson.Status == "no_show" {
		return "~~" + strings.TrimPrefix(line, "- ") + "~~"
	}
	return line
}

func (b *Bot) formatPersonalEventLine(event tutorapi.PersonalEvent, timezone string) string {
	when := mdDateTime(event.StartUTC, timezone, "Mon 02.01 15:04", "wdt")
	group := strings.TrimSpace(event.GroupName)
	if group == "" {
		return fmt.Sprintf("- %s — **%s** (личное, %d мин)", when, mdEscape(event.Title), event.DurationMin)
	}
	return fmt.Sprintf("- %s — **%s** (%s, %d мин)", when, mdEscape(event.Title), mdEscape(group), event.DurationMin)
}

func (b *Bot) formatStudents(title string, students []tutorapi.Student) string {
	if len(students) == 0 {
		return mdHeading(title) + "\n\nСписок пуст"
	}

	var buf strings.Builder
	buf.WriteString(mdHeading(title))
	buf.WriteString("\n\n| Ученик | Предоплата | Долг |\n|:-------|-----------:|-----:|")
	for _, s := range students {
		buf.WriteByte('\n')
		buf.WriteString(b.formatStudentRow(s))
	}
	return buf.String()
}

func (b *Bot) formatStudentLine(s tutorapi.Student) string {
	unit := studentUnit(s.BalanceKind, s.Currency)
	line := fmt.Sprintf("• %s — предоплата %.2f %s, долг %.2f %s",
		s.Name, s.Prepaid, unit, s.Debt, unit)
	if s.OpenLessonDebt > 0 {
		line += fmt.Sprintf(", открытый долг по урокам %.2f %s", s.OpenLessonDebt, unit)
	}
	return line
}

func (b *Bot) formatStudentRow(s tutorapi.Student) string {
	unit := studentUnit(s.BalanceKind, s.Currency)
	debt := fmt.Sprintf("%.2f %s", s.Debt, unit)
	if s.Debt > 0 || s.OpenLessonDebt > 0 {
		debt = "**" + debt + "**"
	}
	if s.OpenLessonDebt > 0 {
		debt += fmt.Sprintf(" (+%.2f)", s.OpenLessonDebt)
	}
	return fmt.Sprintf("| %s | %.2f %s | %s |", mdEscape(s.Name), s.Prepaid, unit, debt)
}

func studentUnit(balanceKind, currency string) string {
	if balanceKind == "lessons" {
		return "ур."
	}
	if currency != "" {
		return currency
	}
	return "у.е."
}

func (b *Bot) formatBotStudent(s tutorapi.BotStudent) string {
	return mdHeading(s.Name) + "\n\nРепетитор: " + mdEscape(s.TutorName) +
		"\nЧасовой пояс: " + mdEscape(s.Timezone) + "\n\n" + b.formatBalance(s.Balance)
}

func (b *Bot) formatBalance(bal tutorapi.StudentBalance) string {
	unit := studentUnit(bal.BalanceKind, bal.Currency)
	var buf strings.Builder
	buf.WriteString(mdHeading("Баланс"))
	buf.WriteString(fmt.Sprintf("\n\nПредоплата: **%.2f %s**\nДолг: **%.2f %s**", bal.Prepaid, unit, bal.Debt, unit))
	if bal.OpenLessonDebt > 0 {
		buf.WriteString(fmt.Sprintf("\nОткрытый долг по урокам: **%.2f %s**", bal.OpenLessonDebt, unit))
	}
	if bal.BillingShared {
		buf.WriteString("\n\n_общий счёт семьи_")
	}
	return buf.String()
}

func (b *Bot) formatStudentSchedule(title string, schedule tutorapi.Schedule) string {
	if len(schedule.Lessons) == 0 {
		return mdHeading(title) + "\n\nНет уроков"
	}

	var buf strings.Builder
	buf.WriteString(mdHeading(title))
	buf.WriteByte('\n')
	for _, lesson := range schedule.Lessons {
		buf.WriteByte('\n')
		when := mdDateTime(lesson.StartUTC, schedule.Timezone, "Mon 02.01 15:04", "wdt")
		paid := "оплачен"
		if !lesson.Paid {
			paid = "==не оплачен=="
		}
		buf.WriteString(fmt.Sprintf("- %s — %s, %d мин, %s",
			when, lessonStatusRU(lesson.Status), lesson.DurationMin, paid))
	}
	return buf.String()
}

func (b *Bot) formatOpenSlots(slots tutorapi.OpenSlots, weekOffset int) string {
	title := slotsWeekTitle(weekOffset)
	if len(slots.Days) == 0 {
		return mdHeading(title) + "\n\nНет данных"
	}

	var buf strings.Builder
	buf.WriteString(mdHeading(title))
	any := false
	var rows strings.Builder
	for _, day := range slots.Days {
		if len(day.Ranges) == 0 {
			continue
		}
		any = true
		parts := make([]string, 0, len(day.Ranges))
		for _, r := range day.Ranges {
			endLabel := fmt.Sprintf("%02d:00", r.EndHour)
			if r.EndHour == 24 {
				endLabel = "24:00"
			}
			parts = append(parts, fmt.Sprintf("%02d:00–%s", r.StartHour, endLabel))
		}
		rows.WriteString(fmt.Sprintf("\n| %s | %s |", formatDateLabel(day.Date, slots.Timezone), strings.Join(parts, ", ")))
	}
	if !any {
		return mdHeading(title) + "\n\nНет свободных часов"
	}
	buf.WriteString("\n\n| День | Свободно |\n|:-----|:---------|")
	buf.WriteString(rows.String())
	return buf.String()
}

func slotsWeekTitle(weekOffset int) string {
	switch weekOffset {
	case 0:
		return "Свободные слоты — эта неделя"
	case 1:
		return "Свободные слоты — следующая неделя"
	default:
		return fmt.Sprintf("Свободные слоты — через %d нед.", weekOffset)
	}
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

func (b *Bot) formatLessonReschedule(move tutorapi.LessonReschedule, timezone string, forStudent bool) string {
	from := mdDateTime(move.FromStartUTC, timezone, "02.01 15:04", "Dt")
	to := mdDateTime(move.ToStartUTC, timezone, "02.01 15:04", "Dt")
	charge := "без списания"
	if move.Charged {
		charge = "со списанием"
	}
	var buf strings.Builder
	buf.WriteString(mdHeading("Урок перенесён"))
	buf.WriteByte('\n')
	if !forStudent {
		buf.WriteString("\nс **")
		buf.WriteString(mdEscape(move.StudentName))
		buf.WriteString("**\n")
	}
	buf.WriteString("\n~~")
	buf.WriteString(from)
	buf.WriteString("~~ → ")
	buf.WriteString(to)
	buf.WriteString("\n\n")
	buf.WriteString(charge)
	return buf.String()
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
