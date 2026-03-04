const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetries = async (task, options = {}) => {
  const retries = Number(options.retries ?? 3);
  const baseDelayMs = Number(options.baseDelayMs ?? 250);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (error?.nonRetryable) {
        break;
      }
      if (attempt >= retries) {
        break;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      await wait(delay);
    }
  }

  throw lastError;
};

module.exports = {
  withRetries,
};
