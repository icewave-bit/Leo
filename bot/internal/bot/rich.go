package bot

import (
	"fmt"
	"strings"
	"time"

	"github.com/go-telegram/bot/models"
)

var mdEscaper = strings.NewReplacer(
	`\`, `\\`,
	`*`, `\*`,
	`_`, `\_`,
	"`", "\\`",
	`[`, `\[`,
	`]`, `\]`,
	`(`, `\(`,
	`)`, `\)`,
	`#`, `\#`,
	`|`, `\|`,
	`!`, `\!`,
	`~`, `\~`,
)

func mdEscape(s string) string {
	return mdEscaper.Replace(s)
}

func mdHeading(title string) string {
	return "# " + mdEscape(title)
}

func unixUTC(startUTC string) (int64, bool) {
	t, err := time.Parse(time.RFC3339Nano, startUTC)
	if err != nil {
		return 0, false
	}
	return t.Unix(), true
}

// mdDateTime renders a Telegram native date_time entity. The alt text stays in
// the tutor/student timezone so the label is correct even if the client TZ differs.
func mdDateTime(startUTC, timezone, layout, format string) string {
	label := mdEscape(formatInZone(startUTC, timezone, layout))
	if u, ok := unixUTC(startUTC); ok {
		return fmt.Sprintf("![%s](tg://time?unix=%d&format=%s)", label, u, format)
	}
	return label
}

func richMarkdown(markdown string) models.InputRichMessage {
	return models.InputRichMessage{Markdown: markdown, SkipEntityDetection: true}
}

func richHelpMarkdown(markdown string) models.InputRichMessage {
	return models.InputRichMessage{Markdown: markdown}
}
