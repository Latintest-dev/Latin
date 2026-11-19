// Daily practice log: how many answers were given each (local) day, and the streak.
// Pure functions. The store keeps { 'YYYY-MM-DD': { n, ok } }.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function shift(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days).getTime());
}

/** Count one answer for the day containing `t`. Returns a new object. */
export function bump(activity, t, ok) {
  const k = dayKey(t);
  const cur = activity[k] || { n: 0, ok: 0 };
  return { ...activity, [k]: { n: cur.n + 1, ok: cur.ok + (ok ? 1 : 0) } };
}

/** Consecutive practice days. Today not yet practiced does not break a streak that reaches yesterday. */
export function streak(activity, now) {
  let k = dayKey(now);
  if (!activity[k]?.n) k = shift(k, -1);
  let n = 0;
  while (activity[k]?.n) { n++; k = shift(k, -1); }
  return n;
}

export function today(activity, now) {
  return activity[dayKey(now)] || { n: 0, ok: 0 };
}

/** Merge two logs: for each day keep the larger counts (the same day on two devices is not added twice). */
export function mergeActivity(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = cur ? { n: Math.max(cur.n, v.n), ok: Math.max(cur.ok, v.ok) } : { n: v.n, ok: v.ok };
  }
  return out;
}

/** Keep roughly the last year so the log stays small. */
export function trim(activity, now, days = 400) {
  const keep = {};
  const first = shift(dayKey(now), -days);
  for (const [k, v] of Object.entries(activity)) if (k >= first) keep[k] = v;
  return keep;
}
