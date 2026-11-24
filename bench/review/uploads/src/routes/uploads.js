const express = require('express');
const { createUpload, findUpload, listUploads } = require('../db');
const { writeUpload, readUpload } = require('../storage');
const { isValidLabel, orderColumn } = require('../validators');
const { isInlineSafe } = require('../mime');

const DEFAULT_SORT = 'created';

const router = express.Router();

function sortDirection(dir) {
  return dir === 'asc' ? 'ASC' : 'DESC';
}

function contentDisposition(upload) {
  const kind = isInlineSafe(upload.content_type) ? 'inline' : 'attachment';
  return `${kind}; filename*=UTF-8''${encodeURIComponent(upload.name)}`;
}

router.post('/', async (req, res, next) => {
  if (!isValidLabel(req.body.label)) return res.status(400).json({ error: 'invalid label' });
  try {
    const bytes = Buffer.from(req.body.content, 'base64');
    const storedPath = await writeUpload(req.user.id, req.body.name, bytes);
    const upload = await createUpload({
      ownerId: req.user.id,
      name: req.body.name,
      label: req.body.label ?? null,
      contentType: req.body.contentType,
      storedPath,
      sizeBytes: bytes.length,
    });
    return res.status(201).json({ id: upload.id, name: upload.name });
  } catch (error) {
    return next(error);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const column = orderColumn(req.query.sort ?? DEFAULT_SORT);
    res.json(await listUploads(req.user.id, column, sortDirection(req.query.dir)));
  } catch (error) {
    next(error);
  }
});

router.get('/:id/content', async (req, res, next) => {
  try {
    const upload = await findUpload(req.params.id);
    if (!upload || upload.owner_id !== req.user.id) return res.status(404).json({ error: 'not found' });
    const bytes = await readUpload(upload.stored_path);
    res.setHeader('Content-Type', upload.content_type);
    res.setHeader('Content-Disposition', contentDisposition(upload));
    return res.send(bytes);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
