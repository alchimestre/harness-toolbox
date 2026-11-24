export async function runTask(task) {
  try {
    const value = await task.handler(task.payload);
    return { ok: true, value };
  } catch (error) {
    const retryable = error.retryable !== false;
    return { ok: false, retryable, error };
  }
}
