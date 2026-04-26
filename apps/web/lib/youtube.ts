export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();

  const patterns = [
    /youtu\.be\/(?:live\/)?([A-Za-z0-9_-]{11})/,
    /[?&]v=([A-Za-z0-9_-]{11})/,
    /\/live\/([A-Za-z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return /^[A-Za-z0-9_-]{11}$/.test(value) ? value : null;
}
