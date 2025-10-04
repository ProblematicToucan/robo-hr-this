import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RetryUtil } from '../../../src/utils/retry.util';

// Mock the logger
vi.mock('../../../src/config/logger', () => ({
    logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    }
}));

describe('RetryUtil - Static Utility Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('executeWithRetry - Success Cases', () => {
        it('should execute operation successfully on first attempt', async () => {
            const mockOperation = vi.fn().mockResolvedValue('success');
            const result = await RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation'
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should execute operation successfully on second attempt after first failure', async () => {
            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce('success');

            const result = await RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 3,
                baseDelay: 10 // Fast for testing
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('should use default options when none provided', async () => {
            const mockOperation = vi.fn().mockResolvedValue('success');
            const result = await RetryUtil.executeWithRetry(mockOperation);

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle custom options correctly', async () => {
            const mockOperation = vi.fn().mockResolvedValue('success');
            const result = await RetryUtil.executeWithRetry(mockOperation, {
                maxAttempts: 5,
                baseDelay: 100,
                maxDelay: 1000,
                operationName: 'custom-operation'
            });

            expect(result).toBe('success');
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });
    });

    describe('executeWithRetry - Failure Cases', () => {
        it('should fail after max attempts with retryable error', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 2,
                baseDelay: 10
            })).rejects.toThrow('network error');

            expect(mockOperation).toHaveBeenCalledTimes(2);
        });

        it('should fail immediately with non-retryable error', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('Invalid API key'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 3
            })).rejects.toThrow('Invalid API key');

            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should use exponential backoff correctly', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));
            const startTime = Date.now();

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 3,
                baseDelay: 50,
                backoffMultiplier: 2
            })).rejects.toThrow();

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Should have delays of 50ms, 100ms (total ~150ms)
            expect(totalTime).toBeGreaterThanOrEqual(140);
            expect(totalTime).toBeLessThan(200);
            expect(mockOperation).toHaveBeenCalledTimes(3);
        });

        it('should respect maxDelay limit', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));
            const startTime = Date.now();

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 100, // Should cap at 100ms
                backoffMultiplier: 2
            })).rejects.toThrow();

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            // Should be capped at maxDelay
            expect(totalTime).toBeLessThan(300); // 100ms + 100ms + buffer
            expect(mockOperation).toHaveBeenCalledTimes(3);
        });
    });

    describe('isRetryableError - Error Classification', () => {
        it('should identify network errors as retryable', async () => {
            const networkErrors = [
                { code: 'ECONNRESET' },
                { code: 'ENOTFOUND' },
                { code: 'ECONNREFUSED' }
            ];

            for (const error of networkErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 2,
                    baseDelay: 10
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(2);
                vi.clearAllMocks();
            }
        });

        it('should identify timeout errors as retryable', async () => {
            const timeoutErrors = [
                { code: 'ETIMEDOUT' },
                { message: 'Request timeout' },
                { message: 'Connection timeout' }
            ];

            for (const error of timeoutErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 2,
                    baseDelay: 10
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(2);
                vi.clearAllMocks();
            }
        });

        it('should identify OpenAI API errors as retryable', async () => {
            const openaiErrors = [
                { status: 429 }, // Rate limit
                { status: 500 }, // Internal server error
                { status: 502 }, // Bad gateway
                { status: 503 }  // Service unavailable
            ];

            for (const error of openaiErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 2,
                    baseDelay: 10
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(2);
                vi.clearAllMocks();
            }
        });

        it('should identify rate limit errors as retryable', async () => {
            const rateLimitErrors = [
                { message: 'rate limit exceeded' },
                { message: 'quota exceeded' },
                { message: 'API quota exceeded' }
            ];

            for (const error of rateLimitErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 2,
                    baseDelay: 10
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(2);
                vi.clearAllMocks();
            }
        });

        it('should identify connection errors as retryable', async () => {
            const connectionErrors = [
                { message: 'connection failed' },
                { message: 'network error occurred' },
                { message: 'connection timeout' }
            ];

            for (const error of connectionErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 2,
                    baseDelay: 10
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(2);
                vi.clearAllMocks();
            }
        });

        it('should identify non-retryable errors correctly', async () => {
            const nonRetryableErrors = [
                { message: 'Invalid API key' },
                { message: 'Authentication failed' },
                { message: 'Permission denied' },
                { message: 'Invalid request format' },
                { code: 'VALIDATION_ERROR' }
            ];

            for (const error of nonRetryableErrors) {
                const mockOperation = vi.fn().mockRejectedValue(error);

                await expect(RetryUtil.executeWithRetry(mockOperation, {
                    operationName: 'test-operation',
                    maxAttempts: 3
                })).rejects.toThrow();

                expect(mockOperation).toHaveBeenCalledTimes(1);
                vi.clearAllMocks();
            }
        });
    });

    describe('executeWithRetry - Edge Cases', () => {
        it('should handle operation that returns undefined', async () => {
            const mockOperation = vi.fn().mockResolvedValue(undefined);
            const result = await RetryUtil.executeWithRetry(mockOperation);

            expect(result).toBeUndefined();
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle operation that returns null', async () => {
            const mockOperation = vi.fn().mockResolvedValue(null);
            const result = await RetryUtil.executeWithRetry(mockOperation);

            expect(result).toBeNull();
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle operation that returns complex object', async () => {
            const complexObject = { data: [1, 2, 3], nested: { key: 'value' } };
            const mockOperation = vi.fn().mockResolvedValue(complexObject);
            const result = await RetryUtil.executeWithRetry(mockOperation);

            expect(result).toEqual(complexObject);
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle operation that throws non-Error objects', async () => {
            const mockOperation = vi.fn().mockRejectedValue('String error');

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 2,
                baseDelay: 10
            })).rejects.toThrow('String error');

            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle maxAttempts of 1', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('Network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 1
            })).rejects.toThrow('Network error');

            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle very large maxAttempts', async () => {
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 10,
                baseDelay: 1
            })).rejects.toThrow('network error');

            expect(mockOperation).toHaveBeenCalledTimes(10);
        });
    });

    describe('executeWithRetry - Logging Integration', () => {
        it('should log debug information for each attempt', async () => {
            const { logger } = await import('../../../src/config/logger');
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 2,
                baseDelay: 10
            })).rejects.toThrow();

            // Should log debug for both attempts
            expect(logger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: 'test-operation',
                    attempt: 1,
                    maxAttempts: 2
                }),
                'Executing test-operation (attempt 1/2)'
            );

            expect(logger.debug).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: 'test-operation',
                    attempt: 2,
                    maxAttempts: 2
                }),
                'Executing test-operation (attempt 2/2)'
            );

            // Should have been called exactly 2 times
            expect(logger.debug).toHaveBeenCalledTimes(2);
        });

        it('should log success on retry', async () => {
            const { logger } = await import('../../../src/config/logger');
            const mockOperation = vi.fn()
                .mockRejectedValueOnce(new Error('network error'))
                .mockResolvedValueOnce('success');

            await RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 3,
                baseDelay: 10
            });

            expect(logger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: 'test-operation',
                    attempt: 2,
                    maxAttempts: 3
                }),
                'test-operation succeeded on attempt 2'
            );
        });

        it('should log warnings for failed attempts', async () => {
            const { logger } = await import('../../../src/config/logger');
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 2,
                baseDelay: 10
            })).rejects.toThrow();

            expect(logger.warn).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: 'test-operation',
                    attempt: 1,
                    maxAttempts: 2,
                    error: 'network error',
                    isRetryable: true
                }),
                'test-operation failed on attempt 1'
            );
        });

        it('should log final error after all attempts', async () => {
            const { logger } = await import('../../../src/config/logger');
            const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));

            await expect(RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                maxAttempts: 2,
                baseDelay: 10
            })).rejects.toThrow();

            expect(logger.error).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: 'test-operation',
                    maxAttempts: 2,
                    error: 'network error'
                }),
                'test-operation failed after 2 attempts'
            );
        });
    });

    describe('executeWithRetry - Performance and Timing', () => {
        it('should not delay on first successful attempt', async () => {
            const mockOperation = vi.fn().mockResolvedValue('success');
            const startTime = Date.now();

            await RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                baseDelay: 1000 // Large delay that shouldn't be used
            });

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(totalTime).toBeLessThan(100); // Should be very fast
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle very fast operations', async () => {
            const mockOperation = vi.fn().mockResolvedValue('success');
            const startTime = Date.now();

            await RetryUtil.executeWithRetry(mockOperation, {
                operationName: 'test-operation',
                baseDelay: 1
            });

            const endTime = Date.now();
            const totalTime = endTime - startTime;

            expect(totalTime).toBeLessThan(50); // Should be very fast
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });

        it('should handle operations that take time to complete', async () => {
            const mockOperation = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return 'success';
            });

            const startTime = Date.now();
            await RetryUtil.executeWithRetry(mockOperation);
            const endTime = Date.now();

            expect(endTime - startTime).toBeGreaterThanOrEqual(45); // More lenient timing
            expect(mockOperation).toHaveBeenCalledTimes(1);
        });
    });

    describe('executeWithRetry - Type Safety', () => {
        it('should preserve return type for string operations', async () => {
            const mockOperation = vi.fn().mockResolvedValue('test-string');
            const result: string = await RetryUtil.executeWithRetry(mockOperation);

            expect(typeof result).toBe('string');
            expect(result).toBe('test-string');
        });

        it('should preserve return type for number operations', async () => {
            const mockOperation = vi.fn().mockResolvedValue(42);
            const result: number = await RetryUtil.executeWithRetry(mockOperation);

            expect(typeof result).toBe('number');
            expect(result).toBe(42);
        });

        it('should preserve return type for object operations', async () => {
            const mockOperation = vi.fn().mockResolvedValue({ key: 'value' });
            const result: { key: string } = await RetryUtil.executeWithRetry(mockOperation);

            expect(typeof result).toBe('object');
            expect(result).toEqual({ key: 'value' });
        });

        it('should preserve return type for array operations', async () => {
            const mockOperation = vi.fn().mockResolvedValue([1, 2, 3]);
            const result: number[] = await RetryUtil.executeWithRetry(mockOperation);

            expect(Array.isArray(result)).toBe(true);
            expect(result).toEqual([1, 2, 3]);
        });
    });
});
