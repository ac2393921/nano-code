import { add, divide, Result } from './calculator';
import { describe, it, expect } from 'vitest';

describe('add', () => {
  it('returns success true and correct value', () => {
    const res: Result = add(1, 2);
    expect(res).toEqual({ success: true, value: 3 });
  });
});

describe('divide', () => {
  it('returns success true and correct value for non-zero divisor', () => {
    const res: Result = divide(4, 2);
    expect(res).toEqual({ success: true, value: 2 });
  });

  it('returns error when dividing by zero', () => {
    const res: Result = divide(4, 0);
    expect(res).toEqual({ success: false, error: 'Cannot divide by zero' });
  });
});
