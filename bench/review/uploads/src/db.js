const { query } = require('./pool');

const LIST_COLUMNS = 'id, name, label, size_bytes, content_type, created_at';

function listUploadsSql(column, direction) {
  return `SELECT ${LIST_COLUMNS} FROM uploads WHERE owner_id = $1 ORDER BY ${column} ${direction}`;
}

async function createUpload(fields) {
  const rows = await query(
    'INSERT INTO uploads (owner_id, name, label, content_type, stored_path, size_bytes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [fields.ownerId, fields.name, fields.label, fields.contentType, fields.storedPath, fields.sizeBytes],
  );
  return rows[0];
}

async function findUpload(id) {
  const rows = await query('SELECT * FROM uploads WHERE id = $1', [id]);
  return rows[0] ?? null;
}

function listUploads(ownerId, column, direction) {
  return query(listUploadsSql(column, direction), [ownerId]);
}

module.exports = { createUpload, findUpload, listUploads };
