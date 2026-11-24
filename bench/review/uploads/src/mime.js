const INLINE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml']);

function isInlineSafe(contentType) {
  return INLINE_TYPES.has(contentType);
}

module.exports = { isInlineSafe };
