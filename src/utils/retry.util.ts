import { logger } from '../config/logger';

/**
 * Retry Utility
 * 
 * Provides retry logic with exponential backoff for critical operations.
 * Handles transient failures gracefully with configurable retry attempts.
 */
export class RetryUtil {
    /**
     * Execute function with retry logic
     */
    static async executeWithRetry<T>(
        operation: () => Promise<T>,
        options: {
            maxAttempts?: number;
            baseDelay?: number;
            maxDelay?: number;
            backoffMultiplier?: number;
            operationName?: string;
        } = {}
    ): Promise<T> {
        const {
            maxAttempts = 3,
            baseDelay = 1000,
            maxDelay = 10000,
            backoffMultiplier = 2,
            operationName = 'operation'
        } = options;

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                logger.debug({
                    operation: operationName,
                    attempt,
                    maxAttempts
                }, `Executing ${operationName} (attempt ${attempt}/${maxAttempts})`);

                const result = await operation();

                if (attempt > 1) {
                    logger.info({
                        operation: operationName,
                        attempt,
                        maxAttempts
                    }, `${operationName} succeeded on attempt ${attempt}`);
                }

                return result;

            } catch (error: any) {
                lastError = error;

                logger.warn({
                    operation: operationName,
                    attempt,
                    maxAttempts,
                    error: error.message,
                    isRetryable: this.isRetryableError(error)
                }, `${operationName} failed on attempt ${attempt}`);

                // Don't retry on last attempt
                if (attempt === maxAttempts) {
                    break;
                }

                // Don't retry if error is not retryable
                if (!this.isRetryableError(error)) {
                    logger.error({
                        operation: operationName,
                        error: error.message
                    }, `${operationName} failed with non-retryable error`);
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    baseDelay * Math.pow(backoffMultiplier, attempt - 1),
                    maxDelay
                );

                logger.info({
                    operation: operationName,
                    attempt,
                    delay
                }, `Retrying ${operationName} in ${delay}ms`);

                await this.sleep(delay);
            }
        }

        logger.error({
            operation: operationName,
            maxAttempts,
            error: lastError?.message
        }, `${operationName} failed after ${maxAttempts} attempts`);

        throw lastError || new Error(`${operationName} failed after ${maxAttempts} attempts`);
    }

    /**
     * Check if error is retryable
     */
    private static isRetryableError(error: any): boolean {
        // Network errors
        if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            return true;
        }

        // Timeout errors
        if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
            return true;
        }

        // OpenAI API specific errors
        if (error.status === 429 || error.status === 500 || error.status === 502 || error.status === 503) {
            return true;
        }

        // Rate limit errors
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
            return true;
        }

        // Connection errors
        if (error.message?.includes('connection') || error.message?.includes('network')) {
            return true;
        }

        // Qdrant specific errors
        if (error.message?.includes('connection') || error.message?.includes('timeout')) {
            return true;
        }

        return false;
    }

    /**
     * Sleep for specified milliseconds
     */
    private static sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
