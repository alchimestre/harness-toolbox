const CENTS_PER_UNIT = 100;
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / CENTS_PER_UNIT);
  const fraction = String(absolute % CENTS_PER_UNIT).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

export function parseAmount(text: string): number {
  if (!AMOUNT_PATTERN.test(text)) {
    throw new Error(`bad amount: ${text}`);
  }
  return Math.round(Number(text) * CENTS_PER_UNIT);
}

export function sumCents(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function percentOf(cents: number, percent: number): number {
  return Math.round((cents * percent) / 100);
}
