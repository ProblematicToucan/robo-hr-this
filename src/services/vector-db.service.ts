import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../config/logger';

/**
 * Vector Database Service
 * 
 * Handles all Qdrant operations for vector storage and retrieval.
 * Provides methods for collection management, point operations, and search.
 */
export class VectorDbService {
    private client: QdrantClient;
    private collectionName = 'ground_truth_docs';

    constructor() {
        this.client = new QdrantClient({
            url: process.env.VECTOR_DB_URL || 'http://localhost:6333',
            timeout: 30000
        });
    }

    /**
     * Initialize Qdrant connection and create collection if it doesn't exist
     */
    async initialize(): Promise<void> {
        try {
            // Test connection
            await this.client.getCollections();
            logger.info('Qdrant connection established');

            // Create collection if it doesn't exist
            await this.ensureCollectionExists();

        } catch (error: any) {
            logger.error('Failed to initialize Qdrant:', error);
            throw new Error(`Qdrant initialization failed: ${error.message}`);
        }
    }

    /**
     * Ensure the collection exists, create if it doesn't
     */
    private async ensureCollectionExists(): Promise<void> {
        try {
            await this.client.getCollection(this.collectionName);
            logger.info(`Collection '${this.collectionName}' already exists`);
        } catch (error: any) {
            // Collection doesn't exist, create it
            logger.info(`Creating collection '${this.collectionName}'`);

            await this.client.createCollection(this.collectionName, {
                vectors: {
                    size: 1536, // OpenAI embedding small model size
                    distance: 'Cosine'
                },
                optimizers_config: {
                    default_segment_number: 2
                },
                replication_factor: 1
            });

            logger.info(`Collection '${this.collectionName}' created successfully`);
        }
    }

    /**
     * Upsert points (vectors) to the collection
     */
    async upsertPoints(points: Array<{
        id: string;
        vector: number[];
        payload: Record<string, any>;
    }>): Promise<void> {
        try {
            // Convert string IDs to UUIDs for Qdrant compatibility
            const qdrantPoints = points.map(point => ({
                id: this.generateUUID(point.id),
                vector: point.vector,
                payload: {
                    ...point.payload,
                    original_id: point.id // Keep original ID in payload
                }
            }));

            await this.client.upsert(this.collectionName, {
                wait: true,
                points: qdrantPoints
            });

            logger.info({
                collection: this.collectionName,
                pointsCount: points.length
            }, 'Points upserted successfully');

        } catch (error: any) {
            logger.error('Failed to upsert points:', error);
            throw new Error(`Failed to upsert points: ${error.message}`);
        }
    }

    /**
     * Generate a UUID from a string ID
     */
    private generateUUID(input: string): string {
        // Simple UUID v4 generation from string
        const hash = this.simpleHash(input);
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = (hash + Math.random() * 16) % 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Simple hash function for consistent UUID generation
     */
    private simpleHash(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Search for similar vectors
     */
    async searchVectors(queryVector: number[], options: {
        limit?: number;
        filter?: Record<string, any>;
        scoreThreshold?: number;
    } = {}): Promise<Array<{
        id: string;
        score: number;
        payload: Record<string, any>;
    }>> {
        try {
            const { limit = 6, filter, scoreThreshold = 0.7 } = options;

            const searchResult = await this.client.search(this.collectionName, {
                vector: queryVector,
                limit,
                filter,
                score_threshold: scoreThreshold,
                with_payload: true,
                with_vector: false
            });

            const results = searchResult.map(point => ({
                id: (point.payload?.original_id as string) || (point.id as string),
                score: point.score,
                payload: point.payload || {}
            }));

            logger.info({
                collection: this.collectionName,
                queryVectorLength: queryVector.length,
                resultsCount: results.length,
                limit
            }, 'Vector search completed');

            return results;

        } catch (error: any) {
            logger.error('Failed to search vectors:', error);
            throw new Error(`Vector search failed: ${error.message}`);
        }
    }

    /**
     * Delete points by filter
     */
    async deletePoints(filter: Record<string, any>): Promise<void> {
        try {
            // Convert document_id filter to use original_id in payload
            const qdrantFilter = this.convertFilterForQdrant(filter);

            await this.client.delete(this.collectionName, {
                wait: true,
                filter: qdrantFilter
            });

            logger.info({
                collection: this.collectionName,
                filter
            }, 'Points deleted successfully');

        } catch (error: any) {
            logger.error('Failed to delete points:', error);
            throw new Error(`Failed to delete points: ${error.message}`);
        }
    }

    /**
     * Convert filter to work with Qdrant payload structure
     */
    private convertFilterForQdrant(filter: Record<string, any>): Record<string, any> {
        if (filter.must && Array.isArray(filter.must)) {
            return {
                ...filter,
                must: filter.must.map((condition: any) => {
                    if (condition.key === 'document_id') {
                        return {
                            key: 'original_id',
                            match: condition.match
                        };
                    }
                    return condition;
                })
            };
        }
        return filter;
    }

    /**
     * Get collection info
     */
    async getCollectionInfo(): Promise<any> {
        try {
            const info = await this.client.getCollection(this.collectionName);
            return info;
        } catch (error: any) {
            logger.error('Failed to get collection info:', error);
            throw new Error(`Failed to get collection info: ${error.message}`);
        }
    }

    /**
     * Get collection statistics
     */
    async getCollectionStats(): Promise<{
        pointsCount: number;
        segmentsCount: number;
        status: string;
    }> {
        try {
            const info = await this.getCollectionInfo();
            return {
                pointsCount: info.points_count || 0,
                segmentsCount: info.segments_count || 0,
                status: info.status || 'unknown'
            };
        } catch (error: any) {
            logger.error('Failed to get collection stats:', error);
            throw new Error(`Failed to get collection stats: ${error.message}`);
        }
    }

    /**
     * Clear all points from collection
     */
    async clearCollection(): Promise<void> {
        try {
            await this.client.delete(this.collectionName, {
                wait: true,
                filter: {} // Empty filter deletes all points
            });

            logger.info({
                collection: this.collectionName
            }, 'Collection cleared successfully');

        } catch (error: any) {
            logger.error('Failed to clear collection:', error);
            throw new Error(`Failed to clear collection: ${error.message}`);
        }
    }

    /**
     * Close the client connection
     */
    async close(): Promise<void> {
        // QdrantClient doesn't have a close method, but we can clean up if needed
        logger.info('Vector database service closed');
    }
}

// Singleton instance
let vectorDbService: VectorDbService | null = null;

export function getVectorDbService(): VectorDbService {
    if (!vectorDbService) {
        vectorDbService = new VectorDbService();
    }
    return vectorDbService;
}
