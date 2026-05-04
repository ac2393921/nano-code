export type Result =
  | { success: true; value: number }
  | { success: false; error: string };

export function add(a: number, b: number): Result {
  const value: number = a + b;
  return { success: true, value };
}

export function divide(a: number, b: number): Result {
  if (b === 0) {
    return { success: false, error: "Cannot divide by zero" };
  }
  const value: number = a / b;
  return { success: true, value };
}
