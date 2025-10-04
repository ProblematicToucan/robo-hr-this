import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorDbService } from '../../../src/services/vector-db.service';

// Mock implementations
const mockQdrantClient = {
    getCollections: vi.fn(),
    getCollection: vi.fn(),
    createCollection: vi.fn(),
    upsert: vi.fn(),
    search: vi.fn(),
    delete: vi.fn()
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

describe('Vector DB Service - Dependency Injection Tests', () => {
    let service: VectorDbService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new VectorDbService(
            mockQdrantClient,
            mockRetryUtil,
            mockLogger,
            'test_collection'
        );

        // Default mock for retryUtil to just execute the operation
        mockRetryUtil.executeWithRetry.mockImplementation(async (fn: any) => await fn());
    });

    describe('Constructor and Factory', () => {
        it('should create service with injected dependencies', () => {
            expect(service).toBeInstanceOf(VectorDbService);
        });

        it('should create service with factory method', () => {
            const prodService = VectorDbService.create();
            expect(prodService).toBeInstanceOf(VectorDbService);
        });
    });

    describe('initialize', () => {
        it('should initialize connection and create collection', async () => {
            mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
            mockQdrantClient.getCollection.mockRejectedValue(new Error('Collection not found'));
            mockQdrantClient.createCollection.mockResolvedValue({ status: 'ok' });

            await service.initialize();

            expect(mockQdrantClient.getCollections).toHaveBeenCalled();
            expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test_collection');
            expect(mockQdrantClient.createCollection).toHaveBeenCalledWith('test_collection', {
                vectors: {
                    size: 1536,
                    distance: 'Cosine'
                },
                optimizers_config: {
                    default_segment_number: 2
                },
                replication_factor: 1
            });
            expect(mockLogger.info).toHaveBeenCalledWith({}, 'Qdrant connection established');
            expect(mockLogger.info).toHaveBeenCalledWith({}, "Creating collection 'test_collection'");
            expect(mockLogger.info).toHaveBeenCalledWith({}, "Collection 'test_collection' created successfully");
        });

        it('should handle existing collection', async () => {
            mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
            mockQdrantClient.getCollection.mockResolvedValue({ status: 'ok' });

            await service.initialize();

            expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test_collection');
            expect(mockQdrantClient.createCollection).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith({}, "Collection 'test_collection' already exists");
        });

        it('should handle initialization errors', async () => {
            const error = new Error('Connection failed');
            mockQdrantClient.getCollections.mockRejectedValue(error);

            await expect(service.initialize()).rejects.toThrow('Qdrant initialization failed: Connection failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize Qdrant:', error);
        });
    });

    describe('upsertPoints', () => {
        it('should upsert points successfully', async () => {
            const points = [
                {
                    id: 'point1',
                    vector: globalThis.testUtils.generateMockEmbedding(),
                    payload: { text: 'test1', type: 'document' }
                },
                {
                    id: 'point2',
                    vector: globalThis.testUtils.generateMockEmbedding(),
                    payload: { text: 'test2', type: 'document' }
                }
            ];

            mockQdrantClient.upsert.mockResolvedValue({ status: 'ok' });

            await service.upsertPoints(points);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'Qdrant upsert points' })
            );
            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
                wait: true,
                points: expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        vector: points[0].vector,
                        payload: expect.objectContaining({
                            original_id: 'point1',
                            text: 'test1',
                            type: 'document'
                        })
                    })
                ])
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    collection: 'test_collection',
                    pointsCount: 2
                }),
                'Points upserted successfully'
            );
        });

        it('should handle upsert errors', async () => {
            const points = [{ id: 'point1', vector: [1, 2, 3], payload: {} }];
            const error = new Error('Upsert failed');
            mockQdrantClient.upsert.mockRejectedValue(error);

            await expect(service.upsertPoints(points)).rejects.toThrow('Upsert failed');
        });

        it('should handle empty points array', async () => {
            mockQdrantClient.upsert.mockResolvedValue({ status: 'ok' });

            await service.upsertPoints([]);

            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
                wait: true,
                points: []
            });
        });
    });

    describe('searchVectors', () => {
        it('should search vectors successfully', async () => {
            const queryVector = globalThis.testUtils.generateMockEmbedding();
            const mockResults = [
                {
                    id: 'point1',
                    score: 0.95,
                    payload: { text: 'test1', type: 'document' }
                },
                {
                    id: 'point2',
                    score: 0.87,
                    payload: { text: 'test2', type: 'document' }
                }
            ];

            mockQdrantClient.search.mockResolvedValue(mockResults);

            const result = await service.searchVectors(queryVector, {
                limit: 5,
                filter: { must: [{ key: 'type', match: { value: 'document' } }] },
                scoreThreshold: 0.8
            });

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'Qdrant vector search' })
            );
            expect(mockQdrantClient.search).toHaveBeenCalledWith('test_collection', {
                vector: queryVector,
                limit: 5,
                filter: { must: [{ key: 'type', match: { value: 'document' } }] },
                score_threshold: 0.8,
                with_payload: true,
                with_vector: false
            });
            expect(result).toEqual([
                {
                    id: 'point1',
                    score: 0.95,
                    payload: { text: 'test1', type: 'document' }
                },
                {
                    id: 'point2',
                    score: 0.87,
                    payload: { text: 'test2', type: 'document' }
                }
            ]);
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    collection: 'test_collection',
                    queryVectorLength: queryVector.length,
                    resultsCount: 2,
                    limit: 5
                }),
                'Vector search completed'
            );
        });

        it('should use default options when not provided', async () => {
            const queryVector = globalThis.testUtils.generateMockEmbedding();
            mockQdrantClient.search.mockResolvedValue([]);

            await service.searchVectors(queryVector);

            expect(mockQdrantClient.search).toHaveBeenCalledWith('test_collection', {
                vector: queryVector,
                limit: 6,
                filter: undefined,
                score_threshold: 0.7,
                with_payload: true,
                with_vector: false
            });
        });

        it('should handle search errors', async () => {
            const queryVector = globalThis.testUtils.generateMockEmbedding();
            const error = new Error('Search failed');
            mockQdrantClient.search.mockRejectedValue(error);

            await expect(service.searchVectors(queryVector)).rejects.toThrow('Search failed');
        });
    });

    describe('deletePoints', () => {
        it('should delete points successfully', async () => {
            const filter = {
                must: [
                    { key: 'document_id', match: { value: 'doc123' } }
                ]
            };

            mockQdrantClient.delete.mockResolvedValue({ status: 'ok' });

            await service.deletePoints(filter);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({ operationName: 'Qdrant delete points' })
            );
            expect(mockQdrantClient.delete).toHaveBeenCalledWith('test_collection', {
                wait: true,
                filter: {
                    must: [
                        { key: 'original_id', match: { value: 'doc123' } }
                    ]
                }
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    collection: 'test_collection',
                    filter
                }),
                'Points deleted successfully'
            );
        });

        it('should handle delete errors', async () => {
            const filter = { must: [] };
            const error = new Error('Delete failed');
            mockQdrantClient.delete.mockRejectedValue(error);

            await expect(service.deletePoints(filter)).rejects.toThrow('Delete failed');
        });
    });

    describe('getCollectionInfo', () => {
        it('should get collection info successfully', async () => {
            const mockInfo = {
                status: 'green',
                points_count: 1000,
                segments_count: 5
            };
            mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

            const result = await service.getCollectionInfo();

            expect(mockQdrantClient.getCollection).toHaveBeenCalledWith('test_collection');
            expect(result).toEqual(mockInfo);
        });

        it('should handle getCollectionInfo errors', async () => {
            const error = new Error('Collection info failed');
            mockQdrantClient.getCollection.mockRejectedValue(error);

            await expect(service.getCollectionInfo()).rejects.toThrow('Failed to get collection info: Collection info failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to get collection info:', error);
        });
    });

    describe('getCollectionStats', () => {
        it('should get collection stats successfully', async () => {
            const mockInfo = {
                points_count: 1000,
                segments_count: 5,
                status: 'green'
            };
            mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

            const result = await service.getCollectionStats();

            expect(result).toEqual({
                pointsCount: 1000,
                segmentsCount: 5,
                status: 'green'
            });
        });

        it('should handle missing stats gracefully', async () => {
            const mockInfo = {};
            mockQdrantClient.getCollection.mockResolvedValue(mockInfo);

            const result = await service.getCollectionStats();

            expect(result).toEqual({
                pointsCount: 0,
                segmentsCount: 0,
                status: 'unknown'
            });
        });

        it('should handle getCollectionStats errors', async () => {
            const error = new Error('Stats failed');
            mockQdrantClient.getCollection.mockRejectedValue(error);

            await expect(service.getCollectionStats()).rejects.toThrow('Failed to get collection stats: Failed to get collection info: Stats failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to get collection stats:', expect.any(Error));
        });
    });

    describe('clearCollection', () => {
        it('should clear collection successfully', async () => {
            mockQdrantClient.delete.mockResolvedValue({ status: 'ok' });

            await service.clearCollection();

            expect(mockQdrantClient.delete).toHaveBeenCalledWith('test_collection', {
                wait: true,
                filter: {}
            });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    collection: 'test_collection'
                }),
                'Collection cleared successfully'
            );
        });

        it('should handle clearCollection errors', async () => {
            const error = new Error('Clear failed');
            mockQdrantClient.delete.mockRejectedValue(error);

            await expect(service.clearCollection()).rejects.toThrow('Failed to clear collection: Clear failed');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to clear collection:', error);
        });
    });

    describe('close', () => {
        it('should close connection gracefully', async () => {
            await service.close();

            expect(mockLogger.info).toHaveBeenCalledWith({}, 'Vector database service closed');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle network errors gracefully', async () => {
            const error = new Error('Network error');
            mockQdrantClient.getCollections.mockRejectedValue(error);

            await expect(service.initialize()).rejects.toThrow('Qdrant initialization failed: Network error');
        });

        it('should handle malformed responses', async () => {
            mockQdrantClient.search.mockResolvedValue(null);

            await expect(service.searchVectors([1, 2, 3])).rejects.toThrow();
        });

        it('should handle very large point arrays', async () => {
            const largePoints = Array.from({ length: 1000 }, (_, i) => ({
                id: `point${i}`,
                vector: globalThis.testUtils.generateMockEmbedding(),
                payload: { index: i }
            }));

            mockQdrantClient.upsert.mockResolvedValue({ status: 'ok' });

            await service.upsertPoints(largePoints);

            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
                wait: true,
                points: expect.arrayContaining([
                    expect.objectContaining({ id: expect.any(String) })
                ])
            });
        });

        it('should handle special characters in point IDs', async () => {
            const points = [{
                id: 'point-with-special-chars!@#$%^&*()',
                vector: globalThis.testUtils.generateMockEmbedding(),
                payload: { text: 'test' }
            }];

            mockQdrantClient.upsert.mockResolvedValue({ status: 'ok' });

            await service.upsertPoints(points);

            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test_collection', {
                wait: true,
                points: expect.arrayContaining([
                    expect.objectContaining({
                        id: expect.any(String),
                        payload: expect.objectContaining({
                            original_id: 'point-with-special-chars!@#$%^&*()'
                        })
                    })
                ])
            });
        });
    });

    describe('Retry Logic Integration', () => {
        it('should use retry util for upsert operations', async () => {
            const points = [{ id: 'point1', vector: [1, 2, 3], payload: {} }];
            mockQdrantClient.upsert.mockResolvedValue({ status: 'ok' });

            await service.upsertPoints(points);

            expect(mockRetryUtil.executeWithRetry).toHaveBeenCalledWith(
                expect.any(Function),
                expect.objectContaining({
                    maxAttempts: 3,
                    baseDelay: 1000,
                    maxDelay: 5000,
                    operationName: 'Qdrant upsert points'
                })
            );
        });

        it('should pass through retry errors', async () => {
            const retryError = new Error('Retry failed');
            mockRetryUtil.executeWithRetry.mockRejectedValue(retryError);

            const points = [{ id: 'point1', vector: [1, 2, 3], payload: {} }];
            await expect(service.upsertPoints(points)).rejects.toThrow('Retry failed');
        });
    });

    describe('Logging Integration', () => {
        it('should log all operations with proper data', async () => {
            mockQdrantClient.getCollections.mockResolvedValue({ collections: [] });
            mockQdrantClient.getCollection.mockRejectedValue(new Error('Not found'));
            mockQdrantClient.createCollection.mockResolvedValue({ status: 'ok' });

            await service.initialize();

            expect(mockLogger.info).toHaveBeenCalledWith({}, 'Qdrant connection established');
            expect(mockLogger.info).toHaveBeenCalledWith({}, "Creating collection 'test_collection'");
            expect(mockLogger.info).toHaveBeenCalledWith({}, "Collection 'test_collection' created successfully");
        });

        it('should log errors appropriately', async () => {
            const error = new Error('Test error');
            mockQdrantClient.getCollections.mockRejectedValue(error);

            await expect(service.initialize()).rejects.toThrow();

            expect(mockLogger.error).toHaveBeenCalledWith('Failed to initialize Qdrant:', error);
        });
    });
});
