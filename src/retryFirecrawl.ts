/**
 * Helper function to delay execution for a specified number of milliseconds.
 * @param ms Time to sleep in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a Firecrawl request with automatic retry on rate limiting (HTTP 429).
 * Uses an exponential backoff strategy that starts with a 5-second delay,
 * doubling each attempt and capped at 120 seconds.
 *
 * @param fn - The function that performs the Firecrawl API call.
 * @param maxRetries - The maximum number of retry attempts allowed.
 * @returns The result of the Firecrawl request.
 * @throws The error if the request fails after all the retry attempts.
 */
export async function executeWithRateLimitRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 5 // Increase this if needed.
): Promise<T> {
  let retries = 0;
  const baseDelay = 5000; // 5-second base delay.
  const maxDelay = 120000; // Maximum delay capped at 120 seconds.

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.statusCode === 429 && retries < maxRetries) {
        const message = error.message || '';
        // Optionally parse recommended wait time from the error message.
        const match = message.match(/please retry after (\d+)s/);
        const recommendedDelay =
          match && match[1] ? Math.min(parseInt(match[1], 10) * 1000, maxDelay) : null;
        // Calculate delay with exponential backoff starting at 5 seconds.
        const backoffDelay = Math.min(Math.pow(2, retries) * baseDelay, maxDelay);
        // Use the recommended delay if provided; otherwise, use the backoff delay.
        const delay = recommendedDelay !== null ? recommendedDelay : backoffDelay;

        console.warn(
          `Rate limit hit. Retrying in ${delay / 1000} seconds... (Attempt ${retries + 1}/${maxRetries})`
        );

        await sleep(delay);
        retries++;
      } else {
        throw error;
      }
    }
  }
} 