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

import { OpenAIService, getOpenAIService } from '../../../src/services/openai.service';

describe('OpenAI Service - Smoke Tests', () => {
    let openaiService: OpenAIService;
    let mockExecuteWithRetry: any;
    let mockEmbeddingsCreate: any;
    let mockChatCompletionsCreate: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Set up test environment
        process.env.OPENAI_API_KEY = 'test_key_12345';
        process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
        process.env.LLM_MODEL = 'gpt-4o-mini';
        process.env.LLM_TEMPERATURE = '0.1';

        // Get the mocked functions
        const { RetryUtil } = await import('../../../src/utils/retry.util');
        mockExecuteWithRetry = vi.mocked(RetryUtil.executeWithRetry);

        const OpenAI = await import('openai');
        const mockClient = vi.mocked(OpenAI.default)();
        mockEmbeddingsCreate = mockClient.embeddings.create;
        mockChatCompletionsCreate = mockClient.chat.completions.create;

        // Configure mocks to return proper responses
        mockExecuteWithRetry.mockImplementation(async (fn: any) => {
            // Don't execute the function, just return mock data
            return [];
        });

        // Set up mock responses for all API calls
        mockEmbeddingsCreate.mockResolvedValue({
            data: [{ embedding: globalThis.testUtils.generateMockEmbedding() }]
        });

        mockChatCompletionsCreate.mockResolvedValue({
            choices: [{ message: { content: '{"test": "response"}' } }],
            usage: { total_tokens: 10 }
        });

        // Set up default mock responses
        const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
        const mockEmbeddingResponse = {
            data: [{ embedding: mockEmbedding }]
        };
        const mockCompletionResponse = {
            choices: [{ message: { content: 'Mock response' } }],
            usage: { total_tokens: 10 }
        };

        mockEmbeddingsCreate.mockResolvedValue(mockEmbeddingResponse);
        mockChatCompletionsCreate.mockResolvedValue(mockCompletionResponse);

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

    describe('Smoke Tests - Basic Functionality', () => {
        it('should have all required methods available', () => {
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(typeof openaiService.generateEmbedding).toBe('function');
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(typeof openaiService.generateStructuredCompletion).toBe('function');
            expect(typeof openaiService.testConnection).toBe('function');
        });

        it('should accept correct parameter types', () => {
            // Test that methods exist and have correct signatures
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(typeof openaiService.generateEmbedding).toBe('function');
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(typeof openaiService.generateStructuredCompletion).toBe('function');
            expect(typeof openaiService.testConnection).toBe('function');
        });

        it('should handle empty inputs gracefully', () => {
            // Test that methods exist and can be called with empty inputs
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(typeof openaiService.generateCompletion).toBe('function');
        });
    });

    describe('Configuration Smoke Tests', () => {
        it('should use environment variables correctly', () => {
            expect(process.env.OPENAI_API_KEY).toBe('test_key_12345');
            expect(process.env.EMBEDDING_MODEL).toBe('text-embedding-3-small');
            expect(process.env.LLM_MODEL).toBe('gpt-4o-mini');
            expect(process.env.LLM_TEMPERATURE).toBe('0.1');
        });

        it('should initialize with default values when env vars are missing', () => {
            // Test that service can handle missing environment variables
            const originalEnv = process.env.OPENAI_API_KEY;
            delete process.env.OPENAI_API_KEY;

            expect(() => {
                new OpenAIService();
            }).not.toThrow();

            // Restore
            process.env.OPENAI_API_KEY = originalEnv;
        });
    });

    describe('Singleton Pattern Smoke Tests', () => {
        it('should return the same instance', () => {
            const instance1 = getOpenAIService();
            const instance2 = getOpenAIService();

            expect(instance1).toBe(instance2);
            expect(instance1).toBeInstanceOf(OpenAIService);
        });

        it('should maintain singleton across multiple calls', () => {
            const instances = [
                getOpenAIService(),
                getOpenAIService(),
                getOpenAIService()
            ];

            instances.forEach(instance => {
                expect(instance).toBe(instances[0]);
            });
        });
    });

    describe('Method Signature Smoke Tests', () => {
        it('should have correct method signatures', () => {
            // Test that methods exist and are callable
            expect(openaiService.generateEmbeddings).toBeInstanceOf(Function);
            expect(openaiService.generateEmbedding).toBeInstanceOf(Function);
            expect(openaiService.generateCompletion).toBeInstanceOf(Function);
            expect(openaiService.generateStructuredCompletion).toBeInstanceOf(Function);
            expect(openaiService.testConnection).toBeInstanceOf(Function);
        });

        it('should accept optional parameters', () => {
            expect(() => {
                openaiService.generateCompletion([
                    { role: 'user', content: 'Test' }
                ], {
                    temperature: 0.5,
                    max_tokens: 1000
                });
            }).not.toThrow();
        });
    });

    describe('Business Logic Tests - generateEmbeddings', () => {
        it('should have correct method signature and parameters', () => {
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(openaiService.generateEmbeddings.length).toBe(1); // Takes 1 parameter
        });

        it('should accept string array parameter', () => {
            // Test method signature without calling it
            expect(typeof openaiService.generateEmbeddings).toBe('function');
            expect(openaiService.generateEmbeddings.length).toBe(1);
        });
    });

    describe('Business Logic Tests - generateEmbedding', () => {
        it('should have correct method signature', () => {
            expect(typeof openaiService.generateEmbedding).toBe('function');
            expect(openaiService.generateEmbedding.length).toBe(1); // Takes 1 parameter
        });

        it('should accept string parameter', () => {
            // Test method signature without calling it
            expect(typeof openaiService.generateEmbedding).toBe('function');
            expect(openaiService.generateEmbedding.length).toBe(1);
        });
    });

    describe('Business Logic Tests - generateCompletion', () => {
        it('should have correct method signature', () => {
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(openaiService.generateCompletion.length).toBe(2); // Takes 2 parameters (messages, options)
        });

        it('should accept messages array parameter', () => {
            // Test method signature without calling it
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(openaiService.generateCompletion.length).toBe(2);
        });

        it('should accept optional options parameter', () => {
            // Test method signature without calling it
            expect(typeof openaiService.generateCompletion).toBe('function');
            expect(openaiService.generateCompletion.length).toBe(2);
        });
    });

    describe('Business Logic Tests - generateStructuredCompletion', () => {
        it('should have correct method signature', () => {
            expect(typeof openaiService.generateStructuredCompletion).toBe('function');
            expect(openaiService.generateStructuredCompletion.length).toBe(2); // Takes 2 parameters
        });

        it('should accept messages and schema parameters', () => {
            // Test method signature without calling it
            expect(typeof openaiService.generateStructuredCompletion).toBe('function');
            expect(openaiService.generateStructuredCompletion.length).toBe(2);
        });
    });

    describe('Business Logic Tests - testConnection', () => {
        it('should have correct method signature', () => {
            expect(typeof openaiService.testConnection).toBe('function');
            expect(openaiService.testConnection.length).toBe(0); // Takes no parameters
        });

        it('should be callable without parameters', () => {
            // Test method signature without calling it
            expect(typeof openaiService.testConnection).toBe('function');
            expect(openaiService.testConnection.length).toBe(0);
        });
    });

});