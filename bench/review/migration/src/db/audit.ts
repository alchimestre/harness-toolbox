import { pool } from './client.js';

export async function logEvent(name: string, subjectId: number, payload: Record<string, unknown>): Promise<void> {
  await pool.query(
    'INSERT INTO audit_log (event_name, subject_id, payload) VALUES ($1, $2, $3)',
    [name, subjectId, JSON.stringify(payload)],
  );
}

export async function recentEvents(subjectId: number, limit: number): Promise<{ name: string; payload: unknown }[]> {
  const result = await pool.query(
    'SELECT event_name, payload FROM audit_log WHERE subject_id = $1 ORDER BY id DESC LIMIT $2',
    [subjectId, limit],
  );
  return result.rows.map((row) => ({ name: row.event_name, payload: row.payload }));
}
