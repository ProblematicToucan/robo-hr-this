import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIService } from '../../../src/services/openai.service';

// Mock implementations
const mockClient = {
    embeddings: {
        create: vi.fn()
    },
    chat: {
        completions: {
            create: vi.fn()
        }
    }
} as any;

const mockRetryUtil = {
    executeWithRetry: vi.fn()
} as any;

const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
} as any;

describe('OpenAI Service - Dependency Injection Tests', () => {
    let service: OpenAIService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new OpenAIService(
            mockClient,
            mockRetryUtil,
            mockLogger,
            'test-embedding-model',
            'test-llm-model',
            0.5
        );

        // Default mock for retryUtil to just execute the operation
        mockRetryUtil.executeWithRetry.mockImplementation(async (fn: any) => await fn());
    });

    describe('Constructor and Factory', () => {
        it('should create service with injected dependencies', () => {
            expect(service).toBeInstanceOf(OpenAIService);
        });

        it('should create service with factory method', () => {
            const prodService = OpenAIService.create();
            expect(prodService).toBeInstanceOf(OpenAIService);
        });
    });

    describe('generateEmbeddings', () => {
        it('should generate embeddings successfully', async () => {
            const texts = ['Hello world', 'Test embedding'];
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResponse = {
                data: [
                    { embedding: mockEmbedding },
                    { embedding: mockEmbedding }
                ]
            };
            mockClient.embeddings.create.mockResolvedValue(mockResponse);

            const result = await service.generateEmbeddings(texts);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'OpenAI embeddings generation' })
            );
            expect(mockClient.embeddings.create).toHaveBeenCalledWith({
                model: 'test-embedding-model',
                input: texts,
                encoding_format: 'float'
            });
            expect(result).toEqual([mockEmbedding, mockEmbedding]);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ textsCount: 2 }),
                'Generating OpenAI embeddings'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ embeddingsCount: 2 }),
                'OpenAI embeddings generated successfully'
            );
        });

        it('should handle API errors through retry util', async () => {
            const error = new Error('API rate limit exceeded');
            mockClient.embeddings.create.mockRejectedValue(error);

            await expect(service.generateEmbeddings(['test'])).rejects.toThrow('API rate limit exceeded');
            expect(mockLogger.error).not.toHaveBeenCalled(); // Error handled by retry util
        });

        it('should handle empty input array', async () => {
            const mockResponse = { data: [] };
            mockClient.embeddings.create.mockResolvedValue(mockResponse);

            const result = await service.generateEmbeddings([]);

            expect(result).toEqual([]);
            expect(mockClient.embeddings.create).toHaveBeenCalledWith({
                model: 'test-embedding-model',
                input: [],
                encoding_format: 'float'
            });
        });
    });

    describe('generateEmbedding', () => {
        it('should generate single embedding', async () => {
            const text = 'Single text';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            const result = await service.generateEmbedding(text);

            expect(mockClient.embeddings.create).toHaveBeenCalledWith({
                model: 'test-embedding-model',
                input: [text],
                encoding_format: 'float'
            });
            expect(result).toEqual(mockEmbedding);
        });

        it('should handle errors with custom message', async () => {
            const error = new Error('Embedding failed');
            mockClient.embeddings.create.mockRejectedValue(error);

            await expect(service.generateEmbedding('test')).rejects.toThrow('OpenAI single embedding generation failed: Embedding failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate single OpenAI embedding:', error);
        });

        it('should handle empty text', async () => {
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            const result = await service.generateEmbedding('');

            expect(result).toEqual(mockEmbedding);
            expect(mockClient.embeddings.create).toHaveBeenCalledWith({
                model: 'test-embedding-model',
                input: [''],
                encoding_format: 'float'
            });
        });
    });

    describe('generateCompletion', () => {
        it('should generate completion successfully', async () => {
            const messages = [{ role: 'user', content: 'Hello' }];
            const mockResponse = {
                choices: [{ message: { content: 'Hi there!' } }],
                usage: { total_tokens: 10 }
            };
            mockClient.chat.completions.create.mockResolvedValue(mockResponse);

            const result = await service.generateCompletion(messages);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'OpenAI completion generation' })
            );
            expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
                model: 'test-llm-model',
                messages: messages,
                temperature: 0.5,
                max_tokens: 2000,
                response_format: undefined
            });
            expect(result).toBe('Hi there!');
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ messagesCount: 1 }),
                'Generating OpenAI completion'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ tokensUsed: 10 }),
                'OpenAI completion generated successfully'
            );
        });

        it('should handle custom options correctly', async () => {
            const messages = [{ role: 'user', content: 'Test' }];
            const options = {
                temperature: 0.8,
                max_tokens: 500,
                response_format: { type: 'json_object' as const }
            };
            const mockResponse = {
                choices: [{ message: { content: '{"status": "ok"}' } }],
                usage: { total_tokens: 5 }
            };
            mockClient.chat.completions.create.mockResolvedValue(mockResponse);

            await service.generateCompletion(messages, options);

            expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
                model: 'test-llm-model',
                messages: messages,
                temperature: 0.8,
                max_tokens: 500,
                response_format: { type: 'json_object' }
            });
        });

        it('should handle empty response', async () => {
            const messages = [{ role: 'user', content: 'Test' }];
            mockClient.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: null } }],
                usage: { total_tokens: 0 }
            });

            await expect(service.generateCompletion(messages)).rejects.toThrow('No content returned from OpenAI');
        });

        it('should handle API errors through retry util', async () => {
            const error = new Error('API rate limit exceeded');
            mockClient.chat.completions.create.mockRejectedValue(error);

            await expect(service.generateCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('API rate limit exceeded');
        });
    });

    describe('generateStructuredCompletion', () => {
        it('should parse JSON response', async () => {
            const messages = [{ role: 'user', content: 'Generate JSON' }];
            const schema = { type: 'object' };
            const mockJson = { key: 'value' };
            mockClient.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: JSON.stringify(mockJson) } }],
                usage: { total_tokens: 20 }
            });

            const result = await service.generateStructuredCompletion(messages, schema);

            expect(mockClient.chat.completions.create).toHaveBeenCalledWith(
                expect.objectContaining({ response_format: { type: 'json_object' } })
            );
            expect(result).toEqual(mockJson);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ parsedKeys: ['key'] }),
                'Structured completion parsed successfully'
            );
        });

        it('should handle JSON parsing errors', async () => {
            const messages = [{ role: 'user', content: 'Invalid JSON' }];
            const schema = { type: 'object' };
            mockClient.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: 'invalid json' } }],
                usage: { total_tokens: 10 }
            });

            await expect(service.generateStructuredCompletion(messages, schema)).rejects.toThrow('Structured completion generation failed:');
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to generate structured completion:'),
                expect.any(Error)
            );
        });

        it('should handle complex JSON structures', async () => {
            const messages = [{ role: 'user', content: 'Generate complex JSON' }];
            const schema = { type: 'object' };
            const mockJson = {
                nested: { value: 123 },
                array: [1, 2, 3],
                boolean: true
            };
            mockClient.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: JSON.stringify(mockJson) } }],
                usage: { total_tokens: 30 }
            });

            const result = await service.generateStructuredCompletion(messages, schema);

            expect(result).toEqual(mockJson);
        });
    });

    describe('testConnection', () => {
        it('should return true on successful connection', async () => {
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: globalThis.testUtils.generateMockEmbedding() }]
            });

            const result = await service.testConnection();

            expect(result).toBe(true);
            expect(mockLogger.info).toHaveBeenCalledWith({}, 'OpenAI connection test successful');
        });

        it('should return false on connection failure', async () => {
            const error = new Error('Connection failed');
            mockClient.embeddings.create.mockRejectedValue(error);

            const result = await service.testConnection();

            expect(result).toBe(false);
            expect(mockLogger.error).toHaveBeenCalledWith('OpenAI connection test failed:', expect.any(Error));
        });

        it('should handle timeout errors', async () => {
            const error = new Error('Request timeout');
            mockClient.embeddings.create.mockRejectedValue(error);

            const result = await service.testConnection();

            expect(result).toBe(false);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle network errors gracefully', async () => {
            const error = new Error('Network error');
            mockClient.embeddings.create.mockRejectedValue(error);

            await expect(service.generateEmbeddings(['test'])).rejects.toThrow('Network error');
        });

        it('should handle malformed API responses', async () => {
            mockClient.embeddings.create.mockResolvedValue({
                data: null // Malformed response
            });

            await expect(service.generateEmbeddings(['test'])).rejects.toThrow();
        });

        it('should handle very long text inputs', async () => {
            const longText = 'a'.repeat(10000);
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            const result = await service.generateEmbedding(longText);

            expect(result).toEqual(mockEmbedding);
            expect(mockClient.embeddings.create).toHaveBeenCalledWith({
                model: 'test-embedding-model',
                input: [longText],
                encoding_format: 'float'
            });
        });

        it('should handle special characters in text', async () => {
            const specialText = 'Hello 世界! 🌍 @#$%^&*()';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            const result = await service.generateEmbedding(specialText);

            expect(result).toEqual(mockEmbedding);
        });
    });

    describe('Retry Logic Integration', () => {
        it('should use retry util for all operations', async () => {
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            await service.generateEmbedding('test');

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    maxAttempts: 3,
                    baseDelay: 1000,
                    maxDelay: 5000,
                    operationName: 'OpenAI embeddings generation'
                })
            );
        });

        it('should pass through retry errors', async () => {
            const retryError = new Error('Retry failed');
            mockRetryUtil.executeWithRetry.mockRejectedValue(retryError);

            await expect(service.generateEmbedding('test')).rejects.toThrow('Retry failed');
        });
    });

    describe('Logging Integration', () => {
        it('should log all operations with proper data', async () => {
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            mockClient.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });

            await service.generateEmbedding('test text');

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ textsCount: 1 }),
                'Generating OpenAI embeddings'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({ embeddingsCount: 1 }),
                'OpenAI embeddings generated successfully'
            );
        });

        it('should log errors appropriately', async () => {
            const error = new Error('Test error');
            mockClient.embeddings.create.mockRejectedValue(error);

            await expect(service.generateEmbedding('test')).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to generate single OpenAI embedding:',
                error
            );
        });
    });
});
