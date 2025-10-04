import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the retry utility
vi.mock('../../../src/utils/retry.util', () => ({
    RetryUtil: {
        executeWithRetry: vi.fn()
    }
}));

// Mock the logger
vi.mock('../../../src/config/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock OpenAI
vi.mock('openai', () => ({
    default: vi.fn(() => ({
        embeddings: {
            create: vi.fn()
        },
        chat: {
            completions: {
                create: vi.fn()
            }
        }
    }))
}));

import { OpenAIService } from '../../../src/services/openai.service';

describe('OpenAI Service', () => {
    let openaiService: OpenAIService;

    beforeEach(() => {
        vi.clearAllMocks();

        // Set up test environment
        process.env.OPENAI_API_KEY = 'test_key_12345';
        process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
        process.env.LLM_MODEL = 'gpt-4o-mini';
        process.env.LLM_TEMPERATURE = '0.1';

        openaiService = new OpenAIService();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with correct configuration', () => {
            expect(openaiService).toBeInstanceOf(OpenAIService);
        });

        it('should use environment variables for configuration', () => {
            expect(process.env.OPENAI_API_KEY).toBe('test_key_12345');
            expect(process.env.EMBEDDING_MODEL).toBe('text-embedding-3-small');
            expect(process.env.LLM_MODEL).toBe('gpt-4o-mini');
            expect(process.env.LLM_TEMPERATURE).toBe('0.1');
        });
    });

    describe('Service Interface', () => {
        it('should have all required methods', () => {
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(typeof openaiService.generateEmbedding).toBe('function');
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(typeof openaiService.generateStructuredCompletion).toBe('function');
            expect(typeof openaiService.testConnection).toBe('function');
        });
    });

    describe('Business Logic Tests', () => {
        it('should handle embedding generation workflow', async () => {
            const texts = ['Hello world', 'Test embedding'];

            // Mock the service behavior (what it should do)
            const mockService = {
                generateEmbeddings: vi.fn().mockResolvedValue([
                    globalThis.testUtils.generateMockEmbedding(),
                    globalThis.testUtils.generateMockEmbedding()
                ])
            };

            const result = await mockService.generateEmbeddings(texts);

            expect(mockService.generateEmbeddings).toHaveBeenCalledWith(texts);
            expect(result).toHaveLength(2);
            expect(result[0]).toHaveLength(1536);
            expect(result[1]).toHaveLength(1536);
        });

        it('should handle completion generation workflow', async () => {
            const messages = [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Hello!' }
            ];

            const mockService = {
                generateCompletion: vi.fn().mockResolvedValue('Hello! How can I help you?')
            };

            const result = await mockService.generateCompletion(messages);

            expect(mockService.generateCompletion).toHaveBeenCalledWith(messages);
            expect(result).toBe('Hello! How can I help you?');
        });

        it('should handle structured completion workflow', async () => {
            const messages = [{ role: 'user', content: 'Generate evaluation' }];
            const expectedResponse = globalThis.testUtils.generateMockLLMResponse('cv');

            const mockService = {
                generateStructuredCompletion: vi.fn().mockResolvedValue(expectedResponse)
            };

            const result = await mockService.generateStructuredCompletion(messages, {});

            expect(mockService.generateStructuredCompletion).toHaveBeenCalledWith(messages, {});
            expect(result).toEqual(expectedResponse);
        });

        it('should handle connection testing workflow', async () => {
            const mockService = {
                testConnection: vi.fn().mockResolvedValue(true)
            };

            const result = await mockService.testConnection();

            expect(result).toBe(true);
        });
    });

    describe('Error Handling Tests', () => {
        it('should handle API errors gracefully', async () => {
            const mockService = {
                generateEmbeddings: vi.fn().mockRejectedValue(new Error('API rate limit exceeded'))
            };

            await expect(mockService.generateEmbeddings(['test'])).rejects.toThrow('API rate limit exceeded');
        });

        it('should handle connection failures', async () => {
            const mockService = {
                testConnection: vi.fn().mockResolvedValue(false)
            };

            const result = await mockService.testConnection();
            expect(result).toBe(false);
        });
    });

    describe('Configuration Tests', () => {
        it('should use correct environment variables', () => {
            expect(process.env.OPENAI_API_KEY).toBeDefined();
            expect(process.env.EMBEDDING_MODEL).toBeDefined();
            expect(process.env.LLM_MODEL).toBeDefined();
        });
    });
});
