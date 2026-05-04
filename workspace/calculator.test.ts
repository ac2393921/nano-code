import { add, divide } from './calculator';
import { describe, it, expect } from 'vitest';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});

describe('divide', () => {
  it('should divide two numbers', () => {
    expect(divide(4, 2)).toBe(2);
  });

  it('should throw an error when dividing by zero', () => {
    expect(() => divide(4, 0)).toThrow('Cannot divide by zero');
  });
});
