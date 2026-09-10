import { describe, expect, it } from 'vitest';
import { formatDistance } from '../src/utils';

describe('formatDistance', () => {
  it('uses metres below a kilometre', () => {
    expect(formatDistance(0.04, 'km')).toBe('40 m');
    expect(formatDistance(0.5, 'km')).toBe('500 m');
  });

  it('switches to kilometres as soon as it would round to one', () => {
    // The haversine returns 999.998 m for a nominal kilometre. Deciding on the
    // raw value left it in the metre branch, which printed "1000 m" where the
    // reader expects "1.00 km" - and made the unit flip at an invisible
    // fraction of a metre.
    expect(formatDistance(0.999998, 'km')).toBe('1.00 km');
    expect(formatDistance(0.9995, 'km')).toBe('1.00 km');
    expect(formatDistance(0.9994, 'km')).toBe('999 m');
  });

  it('does the same for miles and feet', () => {
    expect(formatDistance(0.5, 'mi')).toBe('2640 ft');
    expect(formatDistance(0.99999, 'mi')).toBe('1.00 mi');
  });

  it('drops the decimals of a whole number when asked', () => {
    expect(formatDistance(2, 'km', { removeIntegerDecimals: true })).toBe('2 km');
    expect(formatDistance(2.5, 'km', { removeIntegerDecimals: true })).toBe('2.50 km');
  });
});
