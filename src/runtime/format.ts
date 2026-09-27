/** Small display helpers shared by every napplet. */

/** Coarse relative time from a unix-seconds timestamp. */
export function relative(unixSeconds: number, nowMs = 0): string {
  const now = nowMs === 0 ? unixSeconds * 1000 : nowMs;
  const seconds = Math.max(0, Math.round((now - unixSeconds * 1000) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

/** Shorten a long identifier for display. */
export function truncate(value: string, head = 8, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** First letter of a label, for avatar placeholders. */
export function initials(label: string): string {
  return label.trim().charAt(0).toUpperCase() || "?";
}
