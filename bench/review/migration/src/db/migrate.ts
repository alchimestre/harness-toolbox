import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './client.js';

const DOWN_MARKER = '-- down';

export async function applyMigration(dir: string, name: string): Promise<void> {
  const text = await readFile(path.join(dir, name), 'utf8');
  await runInTransaction(text.split(DOWN_MARKER)[0]);
}

export async function rollbackMigration(dir: string, name: string): Promise<void> {
  const text = await readFile(path.join(dir, name), 'utf8');
  await runInTransaction(text.split(DOWN_MARKER)[1] ?? '');
}

async function runInTransaction(sql: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
