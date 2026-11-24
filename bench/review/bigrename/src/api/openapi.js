const TASK_SCHEMA = {
  type: 'object',
  required: ['id', 'kind'],
  properties: {
    id: { type: 'string', maxLength: 128 },
    kind: { type: 'string' },
    payload: {},
    opts: {
      type: 'object',
      properties: { delayMs: { type: 'integer', minimum: 0 } },
    },
  },
};

export function buildSpec(version = '1.0.0') {
  return {
    openapi: '3.0.3',
    info: { title: 'task service', version },
    paths: {
      '/jobs': {
        post: {
          summary: 'enqueue a task',
          requestBody: { content: { 'application/json': { schema: TASK_SCHEMA } } },
          responses: { 202: { description: 'accepted' }, 400: { description: 'invalid body' } },
        },
        get: {
          summary: 'list stored tasks',
          responses: { 200: { description: 'task list' } },
        },
      },
      '/jobs/{id}': {
        delete: {
          summary: 'remove a task',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 204: { description: 'removed' } },
        },
      },
      '/hooks': {
        post: {
          summary: 'register a webhook',
          responses: { 202: { description: 'accepted' } },
        },
      },
    },
  };
}

export function specJson(version) {
  return JSON.stringify(buildSpec(version), null, 2);
}
