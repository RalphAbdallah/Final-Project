const HUES = [124, 230, 18, 75, 300, 185, 45, 265];

/** A stable avatar hue per member. */
export function hueFor(id) {
  let hash = 0;
  for (const char of String(id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return HUES[hash % HUES.length];
}

export function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** "Charbel", "Charbel and Jason", "Charbel, Jason and Maya" */
export function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}
