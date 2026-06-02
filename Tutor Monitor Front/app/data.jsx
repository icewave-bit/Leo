// ===== Tutor Monitor — mock data =====
// All exported to window for cross-script use (babel scopes are isolated).

const TUTOR = {
  name: "Анна Ковалёва",
  subject: "Английский · Немецкий",
  email: "anna@tutormonitor.app",
  timezone: "Europe/Berlin",
  initials: "АК",
};

// Student palette — warm, distinct, calm
const STUDENTS = [
  {
    id: "s1", name: "Мария Дрозд", initials: "МД", hue: 250,
    tz: "Europe/Moscow", rate: 25, currency: "EUR",
    meet: "meet.google.com/abc-defg-hij",
    prepaid: 150, debt: 0, note: "Готовимся к IELTS, цель — band 7. Любит разговорную практику.",
  },
  {
    id: "s2", name: "Тимур Алиев", initials: "ТА", hue: 28,
    tz: "Asia/Almaty", rate: 2000, currency: "RUB",
    meet: "meet.google.com/k1l-mnop-qrs",
    prepaid: 0, debt: 4000, note: "Два урока не оплачены. Напомнить мягко.",
  },
  {
    id: "s3", name: "Лена Сафина", initials: "ЛС", hue: 155,
    tz: "Europe/Berlin", rate: 25, currency: "EUR",
    meet: "meet.google.com/tuv-wxyz-123",
    prepaid: 50, debt: 0, note: "Бизнес-английский, переписка и созвоны.",
  },
  {
    id: "s4", name: "Group A2", initials: "A2", hue: 300, group: true,
    members: ["Олег", "Дарья", "Илья"],
    tz: "Europe/Berlin", rate: 15, currency: "EUR",
    meet: "meet.google.com/grp-aaaa-bbb",
    prepaid: 0, debt: 0, note: "Группа A2, 3 человека. Грамматика по вторникам.",
  },
  {
    id: "s5", name: "Сабина Юсупова", initials: "СЮ", hue: 70,
    tz: "Asia/Tashkent", rate: 1800, currency: "RUB",
    meet: "meet.google.com/sab-ina0-000",
    prepaid: 1800, debt: 0, note: "Начинающий уровень, German A1.",
  },
];

// Lessons for the visible week. day: 0=Mon..6=Sun, start in 24h float, dur in hours
const LESSONS = [
  { id: "l1", studentId: "s1", day: 0, start: 9.0, dur: 1, status: "completed", paid: true, type: "solo" },
  { id: "l2", studentId: "s3", day: 0, start: 11.0, dur: 1, status: "completed", paid: true, type: "solo" },
  { id: "l3", studentId: "s2", day: 0, start: 16.0, dur: 1, status: "planned", paid: false, type: "solo" },
  { id: "l4", studentId: "s4", day: 1, start: 10.0, dur: 1.5, status: "planned", paid: false, type: "group" },
  { id: "l5", studentId: "s5", day: 1, start: 14.0, dur: 1, status: "planned", paid: true, type: "solo" },
  { id: "l6", studentId: "s1", day: 2, start: 9.0, dur: 1, status: "planned", paid: true, type: "solo" },
  { id: "l7", studentId: "s2", day: 2, start: 17.0, dur: 1, status: "no-show", paid: false, type: "solo" },
  { id: "l8", studentId: "s3", day: 3, start: 11.0, dur: 1, status: "planned", paid: false, type: "solo" },
  { id: "l9", studentId: "s4", day: 3, start: 15.0, dur: 1.5, status: "planned", paid: false, type: "group" },
  { id: "l10", studentId: "s5", day: 4, start: 10.0, dur: 1, status: "planned", paid: true, type: "solo" },
  { id: "l11", studentId: "s1", day: 4, start: 13.0, dur: 1, status: "planned", paid: false, type: "solo" },
  { id: "l12", studentId: "s3", day: 4, start: 16.0, dur: 1, status: "cancelled", paid: false, type: "solo" },
];

const STATUS = {
  planned:   { ru: "Запланирован", hue: 250, dot: "var(--c-primary)" },
  completed: { ru: "Проведён",     hue: 155, dot: "var(--c-credit)" },
  cancelled: { ru: "Отменён",      hue: 80,  dot: "var(--c-muted)" },
  "no-show": { ru: "Не пришёл",    hue: 28,  dot: "var(--c-debt)" },
};

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const DAYS_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
// Week of Mon 1 Jun 2026
const WEEK_DATES = [1, 2, 3, 4, 5, 6, 7];

function fmtMoney(amount, currency) {
  const sym = currency === "EUR" ? "€" : currency === "RUB" ? "₽" : currency;
  const n = amount.toLocaleString("ru-RU");
  return currency === "EUR" ? `${sym}${n}` : `${n}\u202F${sym}`;
}
function fmtTime(t) {
  const h = Math.floor(t);
  const m = Math.round((t - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function studentById(id) { return STUDENTS.find((s) => s.id === id); }

Object.assign(window, {
  TM_TUTOR: TUTOR, TM_STUDENTS: STUDENTS, TM_LESSONS: LESSONS,
  TM_STATUS: STATUS, TM_DAYS: DAYS, TM_DAYS_FULL: DAYS_FULL, TM_WEEK_DATES: WEEK_DATES,
  tmMoney: fmtMoney, tmTime: fmtTime, tmStudent: studentById,
});
