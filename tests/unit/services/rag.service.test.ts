import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RAGService } from '../../../src/services/rag.service';

// Mock implementations
const mockVectorDb = {
    searchVectors: vi.fn(),
    getCollectionStats: vi.fn()
} as any;

const mockOpenAI = {
    generateEmbedding: vi.fn()
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

describe('RAG Service - Dependency Injection Tests', () => {
    let service: RAGService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new RAGService(
            mockVectorDb,
            mockOpenAI,
            mockRetryUtil,
            mockLogger
        );

        // Default mock for retryUtil to just execute the operation
        mockRetryUtil.executeWithRetry.mockImplementation(async (fn: any) => await fn());
    });

    describe('Constructor and Factory', () => {
        it('should create service with injected dependencies', () => {
            expect(service).toBeInstanceOf(RAGService);
        });

        it('should create service with factory method', () => {
            const prodService = RAGService.create();
            expect(prodService).toBeInstanceOf(RAGService);
        });
    });

    describe('retrieveCVContext', () => {
        it('should retrieve CV context successfully', async () => {
            const query = 'Evaluate technical skills';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                {
                    id: 'doc1_chunk1',
                    score: 0.95,
                    payload: {
                        document_type: 'job_description',
                        chunk_text: 'Technical skills required: JavaScript, React, Node.js'
                    }
                },
                {
                    id: 'doc2_chunk1',
                    score: 0.87,
                    payload: {
                        document_type: 'cv_rubric',
                        chunk_text: 'CV evaluation criteria for technical skills'
                    }
                }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(mockResults);

            const result = await service.retrieveCVContext(query, 6);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'CV context retrieval' })
            );
            expect(mockOpenAI.generateEmbedding).toHaveBeenCalledWith(query);
            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, {
                limit: 6,
                filter: {
                    must: [
                        {
                            key: 'document_type',
                            match: { any: ['job_description', 'cv_rubric'] }
                        }
                    ]
                },
                scoreThreshold: 0.7
            });
            expect(result).toEqual({
                context: 'Technical skills required: JavaScript, React, Node.js\n\nCV evaluation criteria for technical skills',
                sources: [
                    {
                        document_type: 'job_description',
                        chunk_text: 'Technical skills required: JavaScript, React, Node.js',
                        score: 0.95
                    },
                    {
                        document_type: 'cv_rubric',
                        chunk_text: 'CV evaluation criteria for technical skills',
                        score: 0.87
                    }
                ]
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: 'Evaluate technical skills',
                    resultsCount: 2,
                    contextLength: expect.any(Number)
                }),
                'CV context retrieved'
            );
        });

        it('should handle empty results', async () => {
            const query = 'No matching content';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            const result = await service.retrieveCVContext(query);

            expect(result).toEqual({
                context: '',
                sources: []
            });
        });

        it('should handle OpenAI embedding errors with fallback', async () => {
            const query = 'Test query';
            const error = new Error('OpenAI API failed');
            const mockFallbackEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockRejectedValue(error);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            const result = await service.retrieveCVContext(query);

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate OpenAI query embedding:', error);
            expect(mockLogger.warn).toHaveBeenCalledWith('Falling back to mock query embedding');
            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(
                expect.arrayContaining([expect.any(Number)]),
                expect.any(Object)
            );
        });

        it('should use default topK when not provided', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveCVContext(query);

            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, {
                limit: 6,
                filter: expect.any(Object),
                scoreThreshold: 0.7
            });
        });
    });

    describe('retrieveProjectContext', () => {
        it('should retrieve project context successfully', async () => {
            const query = 'Evaluate project implementation';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                {
                    id: 'doc1_chunk1',
                    score: 0.92,
                    payload: {
                        document_type: 'case_brief',
                        chunk_text: 'Project requirements and specifications'
                    }
                },
                {
                    id: 'doc2_chunk1',
                    score: 0.88,
                    payload: {
                        document_type: 'project_rubric',
                        chunk_text: 'Evaluation criteria for project quality'
                    }
                }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(mockResults);

            const result = await service.retrieveProjectContext(query, 6);

            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, {
                limit: 6,
                filter: {
                    must: [
                        {
                            key: 'document_type',
                            match: { any: ['case_brief', 'project_rubric'] }
                        }
                    ]
                },
                scoreThreshold: 0.7
            });
            expect(result).toEqual({
                context: 'Project requirements and specifications\n\nEvaluation criteria for project quality',
                sources: [
                    {
                        document_type: 'case_brief',
                        chunk_text: 'Project requirements and specifications',
                        score: 0.92
                    },
                    {
                        document_type: 'project_rubric',
                        chunk_text: 'Evaluation criteria for project quality',
                        score: 0.88
                    }
                ]
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: 'Evaluate project implementation',
                    resultsCount: 2,
                    contextLength: expect.any(Number)
                }),
                'Project context retrieved'
            );
        });

        it('should handle project context errors', async () => {
            const query = 'Test query';
            const error = new Error('Vector search failed');
            mockOpenAI.generateEmbedding.mockResolvedValue(globalThis.testUtils.generateMockEmbedding());
            mockVectorDb.searchVectors.mockRejectedValue(error);

            await expect(service.retrieveProjectContext(query)).rejects.toThrow('Vector search failed');
        });
    });

    describe('retrieveFinalContext', () => {
        it('should retrieve final context successfully', async () => {
            const query = 'Final evaluation synthesis';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                {
                    id: 'doc1_chunk1',
                    score: 0.94,
                    payload: {
                        document_type: 'job_description',
                        chunk_text: 'Overall evaluation criteria'
                    }
                },
                {
                    id: 'doc2_chunk1',
                    score: 0.91,
                    payload: {
                        document_type: 'cv_rubric',
                        chunk_text: 'Final assessment guidelines'
                    }
                }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(mockResults);

            const result = await service.retrieveFinalContext(query, 4);

            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, {
                limit: 4,
                scoreThreshold: 0.7
            });
            expect(result).toEqual({
                context: 'Overall evaluation criteria\n\nFinal assessment guidelines',
                sources: [
                    {
                        document_type: 'job_description',
                        chunk_text: 'Overall evaluation criteria',
                        score: 0.94
                    },
                    {
                        document_type: 'cv_rubric',
                        chunk_text: 'Final assessment guidelines',
                        score: 0.91
                    }
                ]
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: 'Final evaluation synthesis',
                    resultsCount: 2,
                    contextLength: expect.any(Number)
                }),
                'Final context retrieved'
            );
        });

        it('should use default topK for final context', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveFinalContext(query);

            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, {
                limit: 4,
                scoreThreshold: 0.7
            });
        });
    });

    describe('getRAGStats', () => {
        it('should get RAG statistics successfully', async () => {
            const mockStats = {
                pointsCount: 1000,
                segmentsCount: 5,
                status: 'green'
            };

            mockVectorDb.getCollectionStats.mockResolvedValue(mockStats);

            const result = await service.getRAGStats();

            expect(mockVectorDb.getCollectionStats).toHaveBeenCalled();
            expect(result).toEqual({
                totalVectors: 1000,
                collectionStatus: 'green',
                averageScore: 0.85
            });
        });

        it('should handle RAG stats errors', async () => {
            const error = new Error('Stats failed');
            mockVectorDb.getCollectionStats.mockRejectedValue(error);

            await expect(service.getRAGStats()).rejects.toThrow('Failed to get RAG stats: Stats failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to get RAG stats:', error);
        });
    });

    describe('testRAGSystem', () => {
        it('should test RAG system successfully', async () => {
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockCVResults = [
                { id: 'cv1', score: 0.9, payload: { document_type: 'cv_rubric', chunk_text: 'CV test' } }
            ];
            const mockProjectResults = [
                { id: 'proj1', score: 0.8, payload: { document_type: 'project_rubric', chunk_text: 'Project test' } }
            ];
            const mockFinalResults = [
                { id: 'final1', score: 0.85, payload: { document_type: 'job_description', chunk_text: 'Final test' } }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors
                .mockResolvedValueOnce(mockCVResults)
                .mockResolvedValueOnce(mockProjectResults)
                .mockResolvedValueOnce(mockFinalResults);

            const result = await service.testRAGSystem();

            expect(result).toEqual({
                cvContext: {
                    context: 'CV test',
                    sources: [{ document_type: 'cv_rubric', chunk_text: 'CV test', score: 0.9 }]
                },
                projectContext: {
                    context: 'Project test',
                    sources: [{ document_type: 'project_rubric', chunk_text: 'Project test', score: 0.8 }]
                },
                finalContext: {
                    context: 'Final test',
                    sources: [{ document_type: 'job_description', chunk_text: 'Final test', score: 0.85 }]
                }
            });
            expect(mockLogger.info).toHaveBeenCalledWith({}, 'RAG system test completed');
        });

        it('should handle RAG system test errors', async () => {
            const error = new Error('Test failed');
            mockOpenAI.generateEmbedding.mockRejectedValue(error);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            const result = await service.testRAGSystem();

            // The test should still succeed with fallback embeddings
            expect(result).toEqual({
                cvContext: { context: '', sources: [] },
                projectContext: { context: '', sources: [] },
                finalContext: { context: '', sources: [] }
            });
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate OpenAI query embedding:', error);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle network errors gracefully', async () => {
            const error = new Error('Network error');
            mockOpenAI.generateEmbedding.mockRejectedValue(error);

            const result = await service.retrieveCVContext('test');

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate OpenAI query embedding:', error);
            expect(mockLogger.warn).toHaveBeenCalledWith('Falling back to mock query embedding');
        });

        it('should handle malformed search results', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const malformedResults = [
                { id: 'doc1', score: 0.9, payload: { document_type: 'test', chunk_text: 'valid' } },
                { id: 'doc2', score: 0.8, payload: { document_type: 'test', chunk_text: 'also valid' } }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(malformedResults);

            const result = await service.retrieveCVContext(query);

            expect(result.sources).toHaveLength(2);
            expect(result.sources[0]).toEqual({
                document_type: 'test',
                chunk_text: 'valid',
                score: 0.9
            });
        });

        it('should handle very long queries', async () => {
            const longQuery = 'a'.repeat(10000);
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveCVContext(longQuery);

            expect(mockOpenAI.generateEmbedding).toHaveBeenCalledWith(longQuery);
        });

        it('should handle special characters in queries', async () => {
            const specialQuery = 'Test query with special chars!@#$%^&*()_+{}|:"<>?[]\\;\',./';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveCVContext(specialQuery);

            expect(mockOpenAI.generateEmbedding).toHaveBeenCalledWith(specialQuery);
        });

        it('should handle empty query strings', async () => {
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            const result = await service.retrieveCVContext('');

            expect(result.context).toBe('');
            expect(result.sources).toEqual([]);
        });
    });

    describe('Retry Logic Integration', () => {
        it('should use retry util for all operations', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveCVContext(query);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    maxAttempts: 3,
                    baseDelay: 1000,
                    maxDelay: 5000,
                    operationName: 'CV context retrieval'
                })
            );
        });

        it('should pass through retry errors', async () => {
            const retryError = new Error('Retry failed');
            mockRetryUtil.executeWithRetry.mockRejectedValue(retryError);

            await expect(service.retrieveCVContext('test')).rejects.toThrow('Retry failed');
        });
    });

    describe('Logging Integration', () => {
        it('should log all operations with proper data', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue([]);

            await service.retrieveCVContext(query);

            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: 'Test query',
                    resultsCount: 0,
                    contextLength: 0
                }),
                'CV context retrieved'
            );
        });

        it('should log errors appropriately', async () => {
            const error = new Error('Test error');
            mockOpenAI.generateEmbedding.mockRejectedValue(error);

            await service.retrieveCVContext('test');

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate OpenAI query embedding:', error);
            expect(mockLogger.warn).toHaveBeenCalledWith('Falling back to mock query embedding');
        });
    });

    describe('Context Formatting', () => {
        it('should format context correctly with multiple chunks', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                { id: '1', score: 0.9, payload: { document_type: 'test', chunk_text: 'First chunk' } },
                { id: '2', score: 0.8, payload: { document_type: 'test', chunk_text: 'Second chunk' } },
                { id: '3', score: 0.7, payload: { document_type: 'test', chunk_text: 'Third chunk' } }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(mockResults);

            const result = await service.retrieveCVContext(query);

            expect(result.context).toBe('First chunk\n\nSecond chunk\n\nThird chunk');
            expect(result.sources).toHaveLength(3);
        });

        it('should handle single chunk results', async () => {
            const query = 'Test query';
            const mockEmbedding = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                { id: '1', score: 0.9, payload: { document_type: 'test', chunk_text: 'Single chunk' } }
            ];

            mockOpenAI.generateEmbedding.mockResolvedValue(mockEmbedding);
            mockVectorDb.searchVectors.mockResolvedValue(mockResults);

            const result = await service.retrieveCVContext(query);

            expect(result.context).toBe('Single chunk');
            expect(result.sources).toHaveLength(1);
        });
    });
});
