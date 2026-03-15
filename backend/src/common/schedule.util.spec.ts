import { isSecondFriday, getSlotsForDate } from './schedule.util';

describe('isSecondFriday', () => {
  it('returns true for the second Friday of March 2026 (13th)', () => {
    expect(isSecondFriday('2026-03-13')).toBe(true);
  });

  it('returns false for the first Friday of March 2026 (6th)', () => {
    expect(isSecondFriday('2026-03-06')).toBe(false);
  });

  it('returns false for a non-Friday (March 12)', () => {
    expect(isSecondFriday('2026-03-12')).toBe(false);
  });

  it('returns true for second Friday of April 2026 (10th)', () => {
    expect(isSecondFriday('2026-04-10')).toBe(true);
  });

  it('returns false for third Friday of April 2026 (17th)', () => {
    expect(isSecondFriday('2026-04-17')).toBe(false);
  });
});

describe('getSlotsForDate', () => {
  it('returns AM slots for a second Friday', () => {
    const slots = getSlotsForDate('2026-03-13');
    expect(slots).toEqual([
      '08:00', '08:30', '09:00', '09:30', '10:00',
      '10:30', '11:00', '11:30', '12:00',
    ]);
  });

  it('returns PM slots for a regular day', () => {
    const slots = getSlotsForDate('2026-03-12');
    expect(slots).toEqual([
      '12:30', '13:00', '13:30', '14:00',
      '14:30', '15:00', '15:30', '16:00',
    ]);
  });
});
