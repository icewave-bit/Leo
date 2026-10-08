export function rememberPersonalEventTitle(
  current: Record<string, string[]>,
  groupId: string,
  title: string,
): Record<string, string[]> {
  const trimmed = title.trim();
  if (!groupId || !trimmed) return current;
  const key = trimmed.toLocaleLowerCase();
  const list = current[groupId] ?? [];
  return {
    ...current,
    [groupId]: [trimmed, ...list.filter((item) => item.trim().toLocaleLowerCase() !== key)],
  };
}

export function matchingPersonalEventTitles(titles: string[], query: string, limit = 8): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const scored: { title: string; rank: number }[] = [];
  for (const title of titles) {
    const hay = title.toLocaleLowerCase();
    if (hay === needle) continue;
    const at = hay.indexOf(needle);
    if (at < 0) continue;
    scored.push({ title, rank: at === 0 ? 0 : 1 });
  }
  scored.sort((a, b) => a.rank - b.rank);
  return scored.slice(0, limit).map((item) => item.title);
}
