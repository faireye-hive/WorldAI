export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const distSq = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export const towards = (from, to, by) => {
  const d = distance(from, to);
  if (d < 1e-9 || d <= by) return { x: to.x, y: to.y };
  return { x: from.x + (to.x - from.x) * by / d, y: from.y + (to.y - from.y) * by / d };
};
export const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
export const clone = value => JSON.parse(JSON.stringify(value));
