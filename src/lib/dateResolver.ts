const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/**
 * Resolve due_date from natural language in text (e.g. "on Monday", "tomorrow").
 * Uses local date. Returns ISO-style YYYY-MM-DD or null if no match.
 */
export const resolveDueDateFromText = (text: string): string | null => {
  const lower = text.toLowerCase().trim();

  const today = new Date();

  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return toLocalDateStr(d);
  }

  const match = lower.match(
    /\b(on\s+|next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/
  );
  if (!match) return null;

  const targetDay = WEEKDAYS.indexOf(match[2] as (typeof WEEKDAYS)[number]);
  const todayDay = today.getDay();
  let diff = (targetDay - todayDay + 7) % 7;
  const d = new Date(today);
  d.setDate(d.getDate() + diff);
  return toLocalDateStr(d);
};
