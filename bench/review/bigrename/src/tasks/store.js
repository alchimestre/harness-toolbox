import { writeFile } from 'node:fs/promises';

export function createStore(file) {
  const tasks = new Map();
  let closed = false;

  function assertOpen() {
    if (closed) throw new Error('store is closed');
  }

  return {
    saveTask(task) {
      assertOpen();
      tasks.set(task.id, task);
    },
    removeTask(id) {
      assertOpen();
      tasks.delete(id);
    },
    list() {
      return [...tasks.values()];
    },
    async close() {
      closed = true;
      await writeFile(file, JSON.stringify([...tasks.values()], null, 2));
    },
  };
}
