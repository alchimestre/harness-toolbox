import { pool } from './client.js';

export async function createCustomer(name: string): Promise<number> {
  const result = await pool.query('INSERT INTO customers (name) VALUES ($1) RETURNING id', [name]);
  return result.rows[0].id;
}

export async function listCustomers(): Promise<{ id: number; name: string }[]> {
  const result = await pool.query('SELECT id, name FROM customers ORDER BY id');
  return result.rows;
}
