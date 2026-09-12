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
	assert.Equal(t, "# На сегодня\n\nНет записей", b.formatSchedule("На сегодня", tutorapi.Schedule{}, time.Time{}, false))
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
	}, time.Time{}, false)
	assert.Contains(t, text, "| День | События |")
	assert.Contains(t, text, "Yoga")
	assert.Contains(t, text, "Здоровье")
	assert.Contains(t, text, "Leo")
	assert.NotContains(t, text, "запланирован")
	assert.NotContains(t, text, "оплачен")
	assert.NotContains(t, text, "мин")
	yogaIdx := strings.Index(text, "Yoga")
	leoIdx := strings.Index(text, "Leo")
	assert.Greater(t, leoIdx, yogaIdx)
}

func TestFormatSchedule_groupsEventsByDay(t *testing.T) {
	b := &Bot{}
	text := b.formatSchedule("На неделю", tutorapi.Schedule{
		Timezone: "UTC",
		Lessons: []tutorapi.Lesson{
			{StartUTC: "2026-07-20T10:00:00Z", StudentName: "Leo"},
			{StartUTC: "2026-07-21T11:00:00Z", StudentName: "Anna"},
		},
	}, time.Time{}, false)
	assert.Contains(t, text, "| День | События |")
	assert.Contains(t, text, "Mon 20.07")
	assert.Contains(t, text, "Tue 21.07")
	assert.Greater(t, strings.Index(text, "Tue 21.07"), strings.Index(text, "Mon 20.07"))
}

func TestFormatSchedule_splitsTodayAroundNow(t *testing.T) {
	b := &Bot{}
	now := time.Date(2026, 7, 20, 11, 0, 0, 0, time.UTC)
	text := b.formatSchedule("На сегодня", tutorapi.Schedule{
		Timezone: "UTC",
		Lessons: []tutorapi.Lesson{{
			StartUTC:    "2026-07-20T12:00:00Z",
			StudentName: "Leo",
		}},
		Events: []tutorapi.PersonalEvent{{
			StartUTC:  "2026-07-20T09:00:00Z",
			Title:     "Yoga",
			GroupName: "Здоровье",
		}},
	}, now, true)
	assert.Contains(t, text, nowSplitLabel)
	assert.Greater(t, strings.Index(text, nowSplitLabel), strings.Index(text, "Yoga"))
	assert.Greater(t, strings.Index(text, "Leo"), strings.Index(text, nowSplitLabel))

	allFuture := b.formatSchedule("На сегодня", tutorapi.Schedule{
		Timezone: "UTC",
		Lessons: []tutorapi.Lesson{{
			StartUTC:    "2026-07-20T12:00:00Z",
			StudentName: "Leo",
		}},
	}, time.Date(2026, 7, 20, 8, 0, 0, 0, time.UTC), true)
	assert.NotContains(t, allFuture, nowSplitLabel)
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
	assert.Contains(t, tutorText, "**Leo**")
	assert.Contains(t, tutorText, "17:00")
	assert.Contains(t, tutorText, "tg://time?unix=")
	assert.NotContains(t, tutorText, meet)

	studentText := b.formatLessonReminder(lesson, "Europe/Moscow", 30*time.Minute, true)
	assert.Contains(t, studentText, "Урок через 30 мин")
	assert.Contains(t, studentText, "17:00")
	assert.NotContains(t, studentText, "**Leo**")
	assert.NotContains(t, studentText, meet)

	kb := meetJoinKeyboard(meet)
	require.NotNil(t, kb)
	require.Len(t, kb.InlineKeyboard, 1)
	require.Len(t, kb.InlineKeyboard[0], 1)
	assert.Equal(t, "Подключиться", kb.InlineKeyboard[0][0].Text)
	assert.Equal(t, meet, kb.InlineKeyboard[0][0].URL)
	assert.Equal(t, "primary", kb.InlineKeyboard[0][0].Style)
}

func TestFormatLessonReminder_unpaidWhenBalanceShort(t *testing.T) {
	b := &Bot{}
	covered := b.formatLessonReminder(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Leo",
	}, "UTC", 30*time.Minute, false)
	assert.NotContains(t, covered, "не оплачен")

	short := b.formatLessonReminder(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Leo",
		Unpaid:      true,
	}, "UTC", 30*time.Minute, true)
	assert.Contains(t, short, "не оплачен")
}

func TestFormatLessonReminder_omitsEmptyMeetURL(t *testing.T) {
	b := &Bot{}
	text := b.formatLessonReminder(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Leo",
	}, "UTC", 15*time.Minute, false)
	assert.Contains(t, text, "# Урок через 15 мин")
	assert.Contains(t, text, "**Leo**")
	assert.Contains(t, text, "14:00")
	assert.Nil(t, meetJoinKeyboard(""))
}

func TestFormatLessonReschedule_tutorAndStudent(t *testing.T) {
	b := &Bot{}
	move := tutorapi.LessonReschedule{
		FromStartUTC: "2026-09-12T11:00:00.000Z",
		ToStartUTC:   "2026-09-15T13:30:00.000Z",
		StudentName:  "Leo",
		Charged:      false,
	}
	tutorText := b.formatLessonReschedule(move, "Europe/Moscow", false)
	assert.Contains(t, tutorText, "Урок перенесён")
	assert.Contains(t, tutorText, "**Leo**")
	assert.Contains(t, tutorText, "без списания")
	assert.Contains(t, tutorText, "tg://time?unix=")
	assert.NotContains(t, tutorText, "последующие")

	charged := move
	charged.Charged = true
	studentText := b.formatLessonReschedule(charged, "Europe/Moscow", true)
	assert.Contains(t, studentText, "Урок перенесён")
	assert.Contains(t, studentText, "со списанием")
	assert.NotContains(t, studentText, "**Leo**")
}

func TestFormatLessonReschedule_seriesSameTimeAndSplitTimes(t *testing.T) {
	b := &Bot{}
	sameTime := tutorapi.LessonReschedule{
		FromStartUTC: "2026-09-12T15:00:00.000Z",
		ToStartUTC:   "2026-09-12T15:00:00.000Z",
		StudentName:  "Leo",
		Series: []tutorapi.LessonRescheduleSlot{{
			Weekdays:     []int{0, 3},
			StartMinutes: 1080,
		}},
	}
	sameText := b.formatLessonReschedule(sameTime, "UTC", false)
	assert.Contains(t, sameText, "Все последующие уроки будут проходить по Пн и Чт в 18:00")

	split := sameTime
	split.Series = []tutorapi.LessonRescheduleSlot{
		{Weekdays: []int{0}, StartMinutes: 1140},
		{Weekdays: []int{3}, StartMinutes: 1080},
	}
	splitText := b.formatLessonReschedule(split, "UTC", true)
	assert.Contains(t, splitText, "Все последующие уроки будут проходить по Пн в 19:00 и Чт в 18:00")
	assert.NotContains(t, splitText, "**Leo**")
}

func TestFormatLessonCell_usesTimezone(t *testing.T) {
	b := &Bot{}
	line := b.formatLessonCell(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Ivan",
		Status:      "planned",
		DurationMin: 60,
		Paid:        true,
	}, "Europe/Moscow")
	assert.Contains(t, line, "17:00")
	assert.NotContains(t, line, "14:00")
	assert.NotContains(t, line, "оплачен")
	assert.NotContains(t, line, "мин")
	assert.NotContains(t, line, "запланирован")
	assert.NotContains(t, line, "Mon")
}

func TestFormatLessonCell_cancelledStaysInTable(t *testing.T) {
	b := &Bot{}
	line := b.formatLessonCell(tutorapi.Lesson{
		StartUTC:    "2026-07-20T14:00:00Z",
		StudentName: "Ivan",
		Status:      "cancelled",
	}, "UTC")
	assert.True(t, strings.HasPrefix(line, "~~"))
	assert.Contains(t, line, "Ivan")

	text := b.formatSchedule("На сегодня", tutorapi.Schedule{
		Timezone: "UTC",
		Lessons: []tutorapi.Lesson{
			{StartUTC: "2026-07-20T10:00:00Z", StudentName: "Anna", Status: "planned"},
			{StartUTC: "2026-07-20T11:00:00Z", StudentName: "Ivan", Status: "cancelled"},
			{StartUTC: "2026-07-20T12:00:00Z", StudentName: "Leo", Status: "planned"},
		},
	}, time.Time{}, false)
	assert.Contains(t, text, "| День | События |")
	assert.Contains(t, text, "~~")
	anna := strings.Index(text, "Anna")
	ivan := strings.Index(text, "Ivan")
	leo := strings.Index(text, "Leo")
	require.Greater(t, ivan, anna)
	require.Greater(t, leo, ivan)
}

func TestMdDateTime_usesUnixAndTutorLabel(t *testing.T) {
	got := mdDateTime("2026-07-20T14:00:00Z", "Europe/Moscow", "15:04", "t")
	assert.Contains(t, got, "17:00")
	assert.Contains(t, got, "tg://time?unix=1784556000")
	assert.Contains(t, got, "format=t")
}

func TestUnixUTC_acceptsFractionalSeconds(t *testing.T) {
	u, ok := unixUTC("2026-09-12T11:00:00.000Z")
	require.True(t, ok)
	assert.Equal(t, int64(1789210800), u)

	u, ok = unixUTC("2026-09-12T11:00:00Z")
	require.True(t, ok)
	assert.Equal(t, int64(1789210800), u)
}

func TestMdEscape_protectsNames(t *testing.T) {
	assert.Equal(t, `Ann\*a`, mdEscape("Ann*a"))
}

func TestSlotsWeekTitle(t *testing.T) {
	assert.Equal(t, "Свободные слоты — эта неделя", slotsWeekTitle(0))
	assert.Equal(t, "Свободные слоты — следующая неделя", slotsWeekTitle(1))
	assert.Equal(t, "Свободные слоты — через 2 нед.", slotsWeekTitle(2))
}

func TestFormatStudents_signedBalance(t *testing.T) {
	b := &Bot{}
	text := b.formatStudents("Ученики", []tutorapi.Student{
		{ID: "a", Name: "Anna", Currency: "EUR", BalanceKind: "money", Prepaid: 10, Debt: 2.5},
		{ID: "b", Name: "Boris", Currency: "EUR", BalanceKind: "money", Prepaid: 0, Debt: 4},
		{ID: "c", Name: "Cira", Currency: "EUR", BalanceKind: "money", Prepaid: 0, Debt: 0},
	})
	assert.Contains(t, text, "| Ученик | Баланс |")
	assert.NotContains(t, text, "Предоплата")
	assert.NotContains(t, text, "Долг")
	assert.Contains(t, text, "| Anna | +7.50 EUR |")
	assert.Contains(t, text, "| Boris | **−4.00 EUR** |")
	assert.Contains(t, text, "| Cira | 0.00 EUR |")
}

func TestFormatStudents_lessonsAndDependent(t *testing.T) {
	b := &Bot{}
	payerID := "payer"
	text := b.formatStudents("Ученики", []tutorapi.Student{
		{ID: payerID, Name: "Anna", Currency: "EUR", BalanceKind: "lessons", Prepaid: 3, Debt: 0},
		{ID: "child", Name: "Leo", Currency: "EUR", BalanceKind: "lessons", BillingStudentID: &payerID},
	})
	assert.Contains(t, text, "| Anna | +3 ур. |")
	assert.Contains(t, text, "| Leo | Anna |")
	assert.NotContains(t, text, "через")
}

func TestFormatDebts_onlyNegativeSortedByLargest(t *testing.T) {
	b := &Bot{}
	rate := 25.0
	payerID := "payer"
	text := b.formatDebts([]tutorapi.Student{
		{ID: "a", Name: "Ada", Currency: "EUR", BalanceKind: "money", Prepaid: 20, Debt: 0},
		{ID: "b", Name: "Boris", Currency: "EUR", BalanceKind: "money", Prepaid: 0, Debt: 4},
		{ID: "c", Name: "Cira", Currency: "EUR", BalanceKind: "money", Prepaid: 1, Debt: 20},
		{ID: "d", Name: "Dina", Currency: "EUR", BalanceKind: "lessons", Prepaid: 0, Debt: 2, Rate: &rate},
		{ID: "e", Name: "Leo", Currency: "EUR", BalanceKind: "money", BillingStudentID: &payerID, Prepaid: 0, Debt: 99},
	})
	assert.Contains(t, text, "# Долги")
	assert.Contains(t, text, "| Ученик | Баланс |")
	assert.NotContains(t, text, "Предоплата")
	assert.NotContains(t, text, "Ada")
	assert.NotContains(t, text, "Leo")
	assert.NotContains(t, text, "+")
	assert.NotContains(t, text, "через")
	dina := strings.Index(text, "Dina")
	cira := strings.Index(text, "Cira")
	boris := strings.Index(text, "Boris")
	require.Greater(t, dina, 0)
	assert.Greater(t, cira, dina)
	assert.Greater(t, boris, cira)
	assert.Contains(t, text, "| Dina | −2 ур. |")
	assert.Contains(t, text, "| Cira | −19.00 EUR |")
	assert.Contains(t, text, "| Boris | −4.00 EUR |")
	assert.Contains(t, text, "| **Итого** | **−73.00 EUR** |")
}

func TestFormatDebts_empty(t *testing.T) {
	b := &Bot{}
	assert.Equal(t, "# Долги\n\nНет должников", b.formatDebts([]tutorapi.Student{
		{Name: "Ada", Currency: "EUR", BalanceKind: "money", Prepaid: 10, Debt: 0},
	}))
}

func TestFormatBalance_signedNet(t *testing.T) {
	b := &Bot{}
	text := b.formatBalance(tutorapi.StudentBalance{
		BalanceKind: "money",
		Currency:    "EUR",
		Prepaid:     10,
		Debt:        2.5,
	})
	assert.Contains(t, text, "**+7.50 EUR**")
	assert.NotContains(t, text, "Предоплата")
	assert.NotContains(t, text, "Долг")

	neg := b.formatBalance(tutorapi.StudentBalance{
		BalanceKind:   "money",
		Currency:      "EUR",
		Prepaid:       0,
		Debt:          4,
		BillingShared: true,
	})
	assert.Contains(t, neg, "**−4.00 EUR**")
	assert.Contains(t, neg, "общий счёт семьи")
}
