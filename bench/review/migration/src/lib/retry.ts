export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  shouldRetry: (error: unknown) => boolean;
}

export async function withRetry<T>(task: () => Promise<T>, options: RetryOptions): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (!options.shouldRetry(error) || attempt === options.attempts) {
        break;
      }
      await sleep(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export function isTransientPgError(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === '40001' || code === '40P01' || code === '57014';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
