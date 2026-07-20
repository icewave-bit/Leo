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

type LinkInput struct {
	Code             string
	TelegramUserID   int64
	TelegramUsername string
}

type TelegramNotify struct {
	Enabled     bool `json:"enabled"`
	LeadMinutes int  `json:"leadMinutes"` // 5 | 10 | 15 | 30 | 60
	Silent      bool `json:"silent"`
	Lessons     bool `json:"lessons"`
	Personal    bool `json:"personal"`
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

type Schedule struct {
	Timezone     string   `json:"timezone"`
	WeekStartsOn string   `json:"weekStartsOn"`
	From         string   `json:"from"`
	To           string   `json:"to"`
	Lessons      []Lesson `json:"lessons"`
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
