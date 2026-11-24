const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result.rows;
}

module.exports = { query };
