const PM_SLOTS = [
  '12:30', '13:00', '13:30', '14:00',
  '14:30', '15:00', '15:30', '16:00',
  '16:30',
];

const AM_SLOTS = [
  '08:00', '08:30', '09:00', '09:30', '10:00',
  '10:30', '11:00', '11:30', '12:00',
];

// One-off exceptions keyed by ISO date, checked before every other rule.
// 2026-09-17 is the eve of the national holiday: the clinic closes early and
// only runs the morning block below.
const DATE_OVERRIDES: Record<string, string[]> = {
  '2026-09-17': ['08:30', '09:00', '09:30', '10:00', '10:30'],
};

export function isSecondFriday(date: string): boolean {
  const d = new Date(date + 'T00:00:00');
  if (d.getDay() !== 5) return false;

  let fridayCount = 0;
  for (let day = 1; day <= d.getDate(); day++) {
    const check = new Date(d.getFullYear(), d.getMonth(), day);
    if (check.getDay() === 5) fridayCount++;
  }
  return fridayCount === 2;
}

export function getSlotsForDate(date: string): string[] {
  const override = DATE_OVERRIDES[date];
  if (override) return override;

  return isSecondFriday(date) ? AM_SLOTS : PM_SLOTS;
}
