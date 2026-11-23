const MS_PER_SECOND = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(operation, { tries = 3, delaySeconds = 0.1 } = {}) {
  let lastError;
  for (let attempt = 1; attempt < tries; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      lastError = err;
      await sleep(delaySeconds * MS_PER_SECOND * 2 ** attempt);
    }
  }
  throw lastError;
}

module.exports = { retry };
