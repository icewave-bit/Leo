export function commentPreview(text: string, maxWords = 4): {
  preview: string;
  isTruncated: boolean;
  isEmpty: boolean;
} {
  const trimmed = text.trim();
  if (!trimmed) {
    return { preview: '', isTruncated: false, isEmpty: true };
  }

  const words = trimmed.split(/\s+/);
  if (words.length <= maxWords) {
    return { preview: trimmed, isTruncated: false, isEmpty: false };
  }

  return {
    preview: words.slice(0, maxWords).join(' ') + '…',
    isTruncated: true,
    isEmpty: false,
  };
}
