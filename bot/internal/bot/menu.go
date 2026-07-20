package bot

import "github.com/go-telegram/bot/models"

const (
	btnToday     = "Сегодня"
	btnWeek      = "Неделя"
	btnStudents  = "Ученики"
	btnDebt      = "Долги"
	btnMe        = "Профиль"
	btnHelp      = "Справка"
	btnLink      = "Привязать"
	btnBalance   = "Баланс"
	btnOpenSlots = "Свободные слоты"
)

func tutorKeyboard() *models.ReplyKeyboardMarkup {
	return &models.ReplyKeyboardMarkup{
		Keyboard: [][]models.KeyboardButton{
			{{Text: btnToday}, {Text: btnWeek}},
			{{Text: btnStudents}, {Text: btnDebt}},
			{{Text: btnMe}, {Text: btnHelp}},
			{{Text: btnLink}},
		},
		ResizeKeyboard: true,
		IsPersistent:   true,
	}
}

func studentKeyboard() *models.ReplyKeyboardMarkup {
	return &models.ReplyKeyboardMarkup{
		Keyboard: [][]models.KeyboardButton{
			{{Text: btnWeek}, {Text: btnBalance}},
			{{Text: btnOpenSlots}, {Text: btnHelp}},
		},
		ResizeKeyboard: true,
		IsPersistent:   true,
	}
}

func mainKeyboard() *models.ReplyKeyboardMarkup {
	return tutorKeyboard()
}

func keyboardForRole(role botRole) *models.ReplyKeyboardMarkup {
	if role == roleStudent {
		return studentKeyboard()
	}
	return tutorKeyboard()
}

func botCommands() []models.BotCommand {
	return []models.BotCommand{
		{Command: "start", Description: "Начать / привязать ученика"},
		{Command: "link", Description: "Привязать аккаунт репетитора (/link КОД)"},
		{Command: "me", Description: "Профиль"},
		{Command: "today", Description: "Уроки на сегодня"},
		{Command: "week", Description: "Уроки на неделю"},
		{Command: "balance", Description: "Баланс (ученик)"},
		{Command: "slots", Description: "Свободные слоты (ученик)"},
		{Command: "students", Description: "Ученики и балансы"},
		{Command: "debt", Description: "Ученики с долгом"},
		{Command: "help", Description: "Справка"},
	}
}

func resolveInput(text string) (cmd, arg string) {
	if cmd, arg := parseCommand(text); cmd != "" {
		return cmd, arg
	}
	switch text {
	case btnToday:
		return "/today", ""
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
	case btnOpenSlots:
		return "/slots", ""
	default:
		return "", ""
	}
}
