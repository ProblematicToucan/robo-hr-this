import { getVectorDbService, IVectorDbService } from './vector-db.service';
import { getOpenAIService, IOpenAIService } from './openai.service';
import { logger, ILogger } from '../config/logger';
import { RetryUtil, IRetryUtil } from '../utils/retry.util';

/**
 * RAG (Retrieval-Augmented Generation) Service with Dependency Injection
 * 
 * Handles context retrieval for LLM evaluation.
 * Provides relevant document chunks based on evaluation stage and query.
 */
export class RAGService {
    constructor(
        private vectorDb: IVectorDbService,
        private openai: IOpenAIService,
        private retryUtil: IRetryUtil,
        private logger: ILogger
    ) { }

    /**
     * Factory method for production use
     */
    static create(): RAGService {
        return new RAGService(
            getVectorDbService(),
            getOpenAIService(),
            RetryUtil,
            logger
        );
    }

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
        return await this.retryUtil.executeWithRetry(
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
                    .map((result: any) => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map((result: any) => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                this.logger.info({
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
        return await this.retryUtil.executeWithRetry(
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
                    .map((result: any) => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map((result: any) => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                this.logger.info({
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
        return await this.retryUtil.executeWithRetry(
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
                    .map((result: any) => result.payload.chunk_text)
                    .join('\n\n');

                const sources = results.map((result: any) => ({
                    document_type: result.payload.document_type,
                    chunk_text: result.payload.chunk_text,
                    score: result.score
                }));

                this.logger.info({
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
        this.logger.info({
            query: query.substring(0, 100),
            model: 'text-embedding-3-small'
        }, 'Generating OpenAI query embedding');

        const embedding = await this.openai.generateEmbedding(query);

        this.logger.info({
            embeddingDimension: embedding.length
        }, 'OpenAI query embedding generated successfully');

        return embedding;
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
            this.logger.error('Failed to get RAG stats:', error);
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

            this.logger.info({}, 'RAG system test completed');

            return {
                cvContext,
                projectContext,
                finalContext
            };

        } catch (error: any) {
            this.logger.error('RAG system test failed:', error);
            throw new Error(`RAG system test failed: ${error.message}`);
        }
    }
}

// Singleton instance
let ragService: RAGService | null = null;

export function getRAGService(): RAGService {
    if (!ragService) {
        ragService = RAGService.create();
    }
    return ragService;
}
