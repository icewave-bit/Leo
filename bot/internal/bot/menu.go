package bot

import "github.com/go-telegram/bot/models"

const (
	btnToday     = "Сегодня"
	btnTomorrow  = "Завтра"
	btnWeek      = "Неделя"
	btnSlots     = "Слоты"
	btnStudents  = "Ученики"
	btnDebt      = "Долги"
	btnHelp      = "Справка"
	btnLink      = "Привязать"
	btnBalance   = "Баланс"
	btnMe        = "Профиль"
)

func tutorKeyboard() *models.ReplyKeyboardMarkup {
	return &models.ReplyKeyboardMarkup{
		Keyboard: [][]models.KeyboardButton{
			{{Text: btnToday}, {Text: btnTomorrow}},
			{{Text: btnWeek}, {Text: btnSlots}},
			{{Text: btnStudents}, {Text: btnDebt}},
			{{Text: btnHelp}},
		},
		ResizeKeyboard: true,
		IsPersistent:   true,
	}
}

func studentKeyboard() *models.ReplyKeyboardMarkup {
	return &models.ReplyKeyboardMarkup{
		Keyboard: [][]models.KeyboardButton{
			{{Text: btnToday}, {Text: btnWeek}},
			{{Text: btnSlots}, {Text: btnBalance}},
			{{Text: btnHelp}},
		},
		ResizeKeyboard: true,
		IsPersistent:   true,
	}
}

func guestKeyboard() *models.ReplyKeyboardMarkup {
	return &models.ReplyKeyboardMarkup{
		Keyboard: [][]models.KeyboardButton{
			{{Text: btnLink}, {Text: btnHelp}},
		},
		ResizeKeyboard: true,
		IsPersistent:   true,
	}
}

func keyboardForRole(role botRole) *models.ReplyKeyboardMarkup {
	switch role {
	case roleStudent:
		return studentKeyboard()
	case roleTutor:
		return tutorKeyboard()
	default:
		return guestKeyboard()
	}
}

func resolveInput(text string) (cmd, arg string) {
	if cmd, arg := parseCommand(text); cmd != "" {
		return cmd, arg
	}
	switch text {
	case btnToday:
		return "/today", ""
	case btnTomorrow:
		return "/tomorrow", ""
	case btnWeek:
		return "/week", ""
	case btnStudents:
		return "/students", ""
	case btnDebt:
		return "/debt", ""
	case btnMe:
		return "/me", ""
	case btnHelp:
		return "/help", ""
	case btnLink:
		return "/link", ""
	case btnBalance:
		return "/balance", ""
	case btnSlots:
		return "/slots", ""
	default:
		return "", ""
	}
}
