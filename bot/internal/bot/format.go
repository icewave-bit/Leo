package bot

import (
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
	_ "time/tzdata" // IANA zones for Alpine/scratch images without OS tzdata

	"github.com/fedortarasov/leo-bot/internal/tutorapi"
)

const minusSign = "−" // U+2212, same as the LeO UI signed balance

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

const nowSplitLabel = "— сейчас —"

type scheduleItem struct {
	startUTC string
	dateKey  string
	cell     string
}

func (b *Bot) formatSchedule(title string, schedule tutorapi.Schedule, now time.Time, splitNow bool) string {
	items := make([]scheduleItem, 0, len(schedule.Lessons)+len(schedule.Events))
	for _, lesson := range schedule.Lessons {
		items = append(items, scheduleItem{
			startUTC: lesson.StartUTC,
			dateKey:  scheduleDateKey(lesson.StartUTC, schedule.Timezone),
			cell:     b.formatLessonCell(lesson, schedule.Timezone),
		})
	}
	for _, event := range schedule.Events {
		items = append(items, scheduleItem{
			startUTC: event.StartUTC,
			dateKey:  scheduleDateKey(event.StartUTC, schedule.Timezone),
			cell:     b.formatPersonalEventCell(event, schedule.Timezone),
		})
	}
	if len(items) == 0 {
		return mdHeading(title) + "\n\nНет записей"
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].startUTC < items[j].startUTC
	})
	return mdHeading(title) + formatScheduleTable(items, schedule.Timezone, now, splitNow)
}

func (b *Bot) formatLessonCell(lesson tutorapi.Lesson, timezone string) string {
	when := mdDateTime(lesson.StartUTC, timezone, "15:04", "t")
	cell := when + " **" + mdEscape(lesson.StudentName) + "**"
	if lesson.Status == "cancelled" || lesson.Status == "no_show" {
		return "~~" + cell + "~~"
	}
	return cell
}

func (b *Bot) formatPersonalEventCell(event tutorapi.PersonalEvent, timezone string) string {
	when := mdDateTime(event.StartUTC, timezone, "15:04", "t")
	cell := when + " **" + mdEscape(event.Title) + "**"
	if group := strings.TrimSpace(event.GroupName); group != "" {
		cell += " (" + mdEscape(group) + ")"
	}
	return cell
}

func formatScheduleTable(items []scheduleItem, timezone string, now time.Time, splitNow bool) string {
	var buf strings.Builder
	buf.WriteString("\n\n| День | События |\n|:-----|:---------|")
	for i := 0; i < len(items); {
		key := items[i].dateKey
		j := i + 1
		for j < len(items) && items[j].dateKey == key {
			j++
		}
		dayItems := items[i:j]
		cells := make([]string, 0, len(dayItems)+1)
		split := splitNow && !now.IsZero() && scheduleHasPastAndFuture(dayItems, now)
		inserted := false
		for _, it := range dayItems {
			if split && !inserted && !scheduleItemPast(it.startUTC, now) {
				cells = append(cells, nowSplitLabel)
				inserted = true
			}
			cells = append(cells, it.cell)
		}
		buf.WriteString(fmt.Sprintf("\n| %s | %s |", formatDateLabel(key, timezone), strings.Join(cells, "<br>")))
		i = j
	}
	return buf.String()
}

func scheduleDateKey(startUTC, timezone string) string {
	t, err := time.Parse(time.RFC3339Nano, startUTC)
	if err != nil {
		return startUTC
	}
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		loc = time.UTC
	}
	return t.In(loc).Format("2006-01-02")
}

func scheduleHasPastAndFuture(items []scheduleItem, now time.Time) bool {
	past, future := false, false
	for _, it := range items {
		if scheduleItemPast(it.startUTC, now) {
			past = true
		} else {
			future = true
		}
		if past && future {
			return true
		}
	}
	return false
}

func scheduleItemPast(startUTC string, now time.Time) bool {
	u, ok := unixUTC(startUTC)
	if !ok {
		return false
	}
	return time.Unix(u, 0).UTC().Before(now.UTC())
}

func (b *Bot) formatStudents(title string, students []tutorapi.Student) string {
	if len(students) == 0 {
		return mdHeading(title) + "\n\nСписок пуст"
	}

	var buf strings.Builder
	buf.WriteString(mdHeading(title))
	buf.WriteString("\n\n| Ученик | Баланс |\n|:-------|-------:|")
	for _, s := range students {
		buf.WriteByte('\n')
		buf.WriteString(b.formatStudentRow(s, students))
	}
	return buf.String()
}

func (b *Bot) formatDebts(students []tutorapi.Student) string {
	debtors := debtorsByLargestDebt(students)
	if len(debtors) == 0 {
		return mdHeading("Долги") + "\n\nНет должников"
	}

	var buf strings.Builder
	buf.WriteString(mdHeading("Долги"))
	buf.WriteString("\n\n| Ученик | Баланс |\n|:-------|-------:|")
	for _, s := range debtors {
		net := studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind)
		buf.WriteByte('\n')
		buf.WriteString(fmt.Sprintf("| %s | %s |", mdEscape(s.Name), formatSignedAmount(net, s.BalanceKind, s.Currency)))
	}
	buf.WriteString(fmt.Sprintf("\n| **Итого** | **%s** |", formatDebtTotal(debtors)))
	return buf.String()
}

func (b *Bot) formatStudentRow(s tutorapi.Student, students []tutorapi.Student) string {
	label := formatStudentBalanceLabel(s, students)
	if s.BillingStudentID == nil && studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind) < 0 {
		label = "**" + label + "**"
	}
	return fmt.Sprintf("| %s | %s |", mdEscape(s.Name), label)
}

func isDebtor(s tutorapi.Student) bool {
	if s.BillingStudentID != nil && *s.BillingStudentID != "" {
		return false
	}
	return studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind) < 0
}

func debtorsByLargestDebt(students []tutorapi.Student) []tutorapi.Student {
	out := make([]tutorapi.Student, 0, len(students))
	for _, s := range students {
		if isDebtor(s) {
			out = append(out, s)
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		ki, kj := studentDebtMoneyNet(out[i]), studentDebtMoneyNet(out[j])
		if ki != kj {
			return ki < kj
		}
		return out[i].Name < out[j].Name
	})
	return out
}

func studentDebtMoneyNet(s tutorapi.Student) float64 {
	net := studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind)
	if s.BalanceKind == "lessons" && s.Rate != nil && *s.Rate > 0 {
		return math.Round(net*(*s.Rate)*100) / 100
	}
	return net
}

func formatDebtTotal(debtors []tutorapi.Student) string {
	money := map[string]float64{}
	lessons := map[string]float64{}
	for _, s := range debtors {
		net := studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind)
		if s.BalanceKind == "lessons" {
			if s.Rate != nil && *s.Rate > 0 {
				money[s.Currency] += math.Round(net*(*s.Rate)*100) / 100
			} else {
				lessons[s.Currency] += net
			}
			continue
		}
		money[s.Currency] += net
	}
	parts := make([]string, 0, len(money)+len(lessons))
	for _, cur := range sortedKeys(money) {
		parts = append(parts, formatSignedAmount(money[cur], "money", cur))
	}
	for _, cur := range sortedKeys(lessons) {
		parts = append(parts, formatSignedAmount(lessons[cur], "lessons", cur))
	}
	return strings.Join(parts, ", ")
}

func sortedKeys(m map[string]float64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func formatStudentBalanceLabel(s tutorapi.Student, students []tutorapi.Student) string {
	if name := strings.TrimSpace(derefString(s.BillingPayerName)); name != "" {
		return mdEscape(name)
	}
	if s.BillingStudentID != nil && *s.BillingStudentID != "" {
		for _, p := range students {
			if p.ID == *s.BillingStudentID {
				return mdEscape(p.Name)
			}
		}
		return "общий счёт"
	}
	return formatSignedAmount(studentBalanceNet(s.Prepaid, s.Debt, s.BalanceKind), s.BalanceKind, s.Currency)
}

func derefString(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func studentBalanceNet(prepaid, debt float64, kind string) float64 {
	net := prepaid - debt
	if kind == "lessons" {
		return math.Round(net)
	}
	return math.Round(net*100) / 100
}

func formatSignedAmount(net float64, kind, currency string) string {
	unit := studentUnit(kind, currency)
	abs := math.Abs(net)
	var amount string
	if kind == "lessons" {
		amount = fmt.Sprintf("%.0f %s", abs, unit)
	} else {
		amount = fmt.Sprintf("%.2f %s", abs, unit)
	}
	switch {
	case net > 0:
		return "+" + amount
	case net < 0:
		return minusSign + amount
	default:
		return amount
	}
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
	amount := formatSignedAmount(studentBalanceNet(bal.Prepaid, bal.Debt, bal.BalanceKind), bal.BalanceKind, bal.Currency)
	var buf strings.Builder
	buf.WriteString(mdHeading("Баланс"))
	buf.WriteString(fmt.Sprintf("\n\n**%s**", amount))
	if bal.BillingShared {
		buf.WriteString("\n\n_общий счёт семьи_")
	}
	return buf.String()
}

func (b *Bot) formatStudentSchedule(title string, schedule tutorapi.Schedule, now time.Time, splitNow bool) string {
	if len(schedule.Lessons) == 0 {
		return mdHeading(title) + "\n\nНет уроков"
	}

	items := make([]scheduleItem, 0, len(schedule.Lessons))
	for _, lesson := range schedule.Lessons {
		when := mdDateTime(lesson.StartUTC, schedule.Timezone, "15:04", "t")
		cell := when
		if lesson.Status == "cancelled" || lesson.Status == "no_show" {
			cell = "~~" + when + "~~"
		}
		items = append(items, scheduleItem{
			startUTC: lesson.StartUTC,
			dateKey:  scheduleDateKey(lesson.StartUTC, schedule.Timezone),
			cell:     cell,
		})
	}
	return mdHeading(title) + formatScheduleTable(items, schedule.Timezone, now, splitNow)
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
	return "Свободные слоты — " + weekScopeLabel(weekOffset)
}

func scheduleWeekTitle(weekOffset int, forStudent bool) string {
	base := "На неделю"
	if forStudent {
		base = "Уроки на неделю"
	}
	return base + " — " + weekScopeLabel(weekOffset)
}

func weekScopeLabel(weekOffset int) string {
	switch weekOffset {
	case 0:
		return "эта неделя"
	case 1:
		return "следующая неделя"
	default:
		return fmt.Sprintf("через %d нед.", weekOffset)
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
	if series := formatRescheduleSeries(move.Series); series != "" {
		buf.WriteString("\n\nВсе последующие уроки будут проходить ")
		buf.WriteString(series)
	}
	buf.WriteString("\n\n")
	buf.WriteString(charge)
	return buf.String()
}

var weekdayShortRU = []string{"Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"}

func formatRescheduleSeries(slots []tutorapi.LessonRescheduleSlot) string {
	groups := make([]string, 0, len(slots))
	for _, slot := range slots {
		days := formatWeekdayList(slot.Weekdays)
		if days == "" {
			continue
		}
		groups = append(groups, days+" в "+formatMinutesClock(slot.StartMinutes))
	}
	if len(groups) == 0 {
		return ""
	}
	return "по " + joinRussian(groups)
}

func formatWeekdayList(days []int) string {
	labels := make([]string, 0, len(days))
	for _, day := range days {
		if day < 0 || day >= len(weekdayShortRU) {
			continue
		}
		labels = append(labels, weekdayShortRU[day])
	}
	return joinRussian(labels)
}

func joinRussian(items []string) string {
	switch len(items) {
	case 0:
		return ""
	case 1:
		return items[0]
	case 2:
		return items[0] + " и " + items[1]
	default:
		return strings.Join(items[:len(items)-1], ", ") + " и " + items[len(items)-1]
	}
}

func formatMinutesClock(minutes int) string {
	if minutes < 0 {
		minutes = 0
	}
	return fmt.Sprintf("%02d:%02d", minutes/60, minutes%60)
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
