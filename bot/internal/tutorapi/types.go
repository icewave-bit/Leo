package tutorapi

type Error struct {
	Status  int
	Code    string
	Message string
}

func (e *Error) Error() string {
	if e.Code != "" {
		return e.Code + ": " + e.Message
	}
	return e.Message
}

func (e *Error) NotLinked() bool {
	return e.Code == "TELEGRAM_NOT_LINKED"
}

func (e *Error) NotFound() bool {
	return e.Code == "NOT_FOUND" || e.Status == 404
}

type LinkInput struct {
	Code             string
	TelegramUserID   int64
	TelegramUsername string
}

type StudentRegisterInput struct {
	TelegramUserID   int64
	TelegramUsername string
}

type TelegramNotify struct {
	Enabled          bool     `json:"enabled"`
	LeadMinutes      int      `json:"leadMinutes"` // 5 | 10 | 15 | 30 | 60
	Silent           bool     `json:"silent"`
	Lessons          bool     `json:"lessons"`
	Personal         bool     `json:"personal"`
	PersonalGroupIds []string `json:"personalGroupIds"`
}

type Tutor struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	Timezone         string         `json:"timezone"`
	TelegramLinked   bool           `json:"telegramLinked"`
	TelegramUsername *string        `json:"telegramUsername"`
	TelegramNotify   TelegramNotify `json:"telegramNotify"`
}

type Lesson struct {
	ID            string `json:"id"`
	StartUTC      string `json:"startUtc"`
	DurationMin   int    `json:"durationMin"`
	Status        string `json:"status"`
	Paid          bool   `json:"paid"`
	StudentName   string `json:"studentName"`
	AcademicUnits int    `json:"academicUnits"`
}

type PersonalEvent struct {
	ID          string `json:"id"`
	GroupID     string `json:"groupId"`
	GroupName   string `json:"groupName"`
	Title       string `json:"title"`
	StartUTC    string `json:"startUtc"`
	DurationMin int    `json:"durationMin"`
}

type Schedule struct {
	Timezone     string          `json:"timezone"`
	WeekStartsOn string          `json:"weekStartsOn"`
	From         string          `json:"from"`
	To           string          `json:"to"`
	Lessons      []Lesson        `json:"lessons"`
	Events       []PersonalEvent `json:"events"`
}

type Student struct {
	Name           string   `json:"name"`
	Currency       string   `json:"currency"`
	BalanceKind    string   `json:"balanceKind"`
	Prepaid        float64  `json:"prepaid"`
	Debt           float64  `json:"debt"`
	OpenLessonDebt float64  `json:"openLessonDebt"`
	Rate           *float64 `json:"rate"`
}

type StudentBalance struct {
	Name           string  `json:"name"`
	BalanceKind    string  `json:"balanceKind"`
	Currency       string  `json:"currency"`
	Prepaid        float64 `json:"prepaid"`
	Debt           float64 `json:"debt"`
	OpenLessonDebt float64 `json:"openLessonDebt"`
	BillingShared  bool    `json:"billingShared"`
}

type BotStudent struct {
	ID               string         `json:"id"`
	Name             string         `json:"name"`
	TutorName        string         `json:"tutorName"`
	Timezone         string         `json:"timezone"`
	TelegramUsername *string        `json:"telegramUsername"`
	Balance          StudentBalance `json:"balance"`
}

type OpenSlotRange struct {
	StartHour int `json:"startHour"`
	EndHour   int `json:"endHour"`
}

type OpenSlotsDay struct {
	Date    string          `json:"date"`
	Weekday int             `json:"weekday"`
	Ranges  []OpenSlotRange `json:"ranges"`
}

type OpenSlots struct {
	Timezone     string         `json:"timezone"`
	WeekStartsOn string         `json:"weekStartsOn"`
	From         string         `json:"from"`
	To           string         `json:"to"`
	Days         []OpenSlotsDay `json:"days"`
}
