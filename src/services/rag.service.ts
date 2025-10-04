import { getVectorDbService } from './vector-db.service';
import { getOpenAIService } from './openai.service';
import { logger } from '../config/logger';
import { RetryUtil } from '../utils/retry.util';

/**
 * RAG (Retrieval-Augmented Generation) Service
 * 
 * Handles context retrieval for LLM evaluation.
 * Provides relevant document chunks based on evaluation stage and query.
 */
export class RAGService {
    private vectorDb = getVectorDbService();
    private openai = getOpenAIService();

    /**
     * Retrieve context for CV evaluation (Stage S1)
     */
    async retrieveCVContext(query: string, topK: number = 6): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }> {
        return await RetryUtil.executeWithRetry(
            async () => {
                // Generate deterministic query embedding
                const queryEmbedding = await this.generateQueryEmbedding(query);

                // Search for relevant documents
                const results = await this.vectorDb.searchVectors(queryEmbedding, {
                    limit: topK,
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

                // Format context
                const context = results
                    .map(result => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map(result => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                logger.info({
                    query: query.substring(0, 100),
                    resultsCount: results.length,
                    contextLength: context.length
                }, 'CV context retrieved');

                return { context, sources };
            },
            {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000,
                operationName: 'CV context retrieval'
            }
        );
    }

    /**
     * Retrieve context for project evaluation (Stage S2)
     */
    async retrieveProjectContext(query: string, topK: number = 6): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }> {
        return await RetryUtil.executeWithRetry(
            async () => {
                // Generate deterministic query embedding
                const queryEmbedding = await this.generateQueryEmbedding(query);

                // Search for relevant documents
                const results = await this.vectorDb.searchVectors(queryEmbedding, {
                    limit: topK,
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

                // Format context
                const context = results
                    .map(result => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map(result => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                logger.info({
                    query: query.substring(0, 100),
                    resultsCount: results.length,
                    contextLength: context.length
                }, 'Project context retrieved');

                return { context, sources };
            },
            {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000,
                operationName: 'Project context retrieval'
            }
        );
    }

    /**
     * Retrieve context for final synthesis (Stage S3)
     */
    async retrieveFinalContext(query: string, topK: number = 4): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }> {
        return await RetryUtil.executeWithRetry(
            async () => {
                // Generate deterministic query embedding
                const queryEmbedding = await this.generateQueryEmbedding(query);

                // Search for relevant documents (any type)
                const results = await this.vectorDb.searchVectors(queryEmbedding, {
                    limit: topK,
                    scoreThreshold: 0.7
                });

                // Format context
                const context = results
                    .map(result => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map(result => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                logger.info({
                    query: query.substring(0, 100),
                    resultsCount: results.length,
                    contextLength: context.length
                }, 'Final context retrieved');

                return { context, sources };
            },
            {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000,
                operationName: 'Final context retrieval'
            }
        );
    }

    /**
     * Generate query embedding using OpenAI
     */
    private async generateQueryEmbedding(query: string): Promise<number[]> {
        try {
            logger.info({
                query: query.substring(0, 100),
                model: 'text-embedding-3-small'
            }, 'Generating OpenAI query embedding');

            const embedding = await this.openai.generateEmbedding(query);

            logger.info({
                embeddingDimension: embedding.length
            }, 'OpenAI query embedding generated successfully');

            return embedding;

        } catch (error: any) {
            logger.error('Failed to generate OpenAI query embedding:', error);

            // Fallback to mock embedding if OpenAI fails
            logger.warn('Falling back to mock query embedding');
            return this.generateDeterministicEmbedding(query, 0);
        }
    }

    /**
     * Generate deterministic embedding based on content
     */
    private generateDeterministicEmbedding(text: string, index: number): number[] {
        // Create a simple hash from text content
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Add index to make each chunk unique
        hash += index * 1000;

        // Generate deterministic vector based on hash
        const vector = [];
        for (let i = 0; i < 1536; i++) {
            // Use hash + i as seed for deterministic "random" values
            const seed = (hash + i) % 2147483647;
            const normalized = (Math.sin(seed) + 1) / 2; // Normalize to 0-1
            vector.push(normalized * 2 - 1); // Scale to -1 to 1
        }

        return vector;
    }

    /**
     * Get RAG system statistics
     */
    async getRAGStats(): Promise<{
        totalVectors: number;
        collectionStatus: string;
        averageScore: number;
    }> {
        try {
            const stats = await this.vectorDb.getCollectionStats();

            return {
                totalVectors: stats.pointsCount,
                collectionStatus: stats.status,
                averageScore: 0.85 // Mock value
            };

        } catch (error: any) {
            logger.error('Failed to get RAG stats:', error);
            throw new Error(`Failed to get RAG stats: ${error.message}`);
        }
    }

    /**
     * Test RAG system with a sample query
     */
    async testRAGSystem(): Promise<{
        cvContext: any;
        projectContext: any;
        finalContext: any;
    }> {
        try {
            const testQuery = "Evaluate technical skills and experience level";

            const cvContext = await this.retrieveCVContext(testQuery, 3);
            const projectContext = await this.retrieveProjectContext(testQuery, 3);
            const finalContext = await this.retrieveFinalContext(testQuery, 2);

            logger.info('RAG system test completed');

            return {
                cvContext,
                projectContext,
                finalContext
            };

        } catch (error: any) {
            logger.error('RAG system test failed:', error);
            throw new Error(`RAG system test failed: ${error.message}`);
        }
    }
}

// Singleton instance
let ragService: RAGService | null = null;

export function getRAGService(): RAGService {
    if (!ragService) {
        ragService = new RAGService();
    }
    return ragService;
}
