import OpenAI from 'openai';
import { logger, ILogger } from '../config/logger';
import { RetryUtil, IRetryUtil } from '../utils/retry.util';

// Interfaces for better testability
export interface IOpenAIClient {
    embeddings: {
        create: (params: {
            model: string;
            input: string[];
            encoding_format: string;
        }) => Promise<{
            data: Array<{ embedding: number[] }>;
        }>;
    };
    chat: {
        completions: {
            create: (params: {
                model: string;
                messages: Array<{ role: string; content: string }>;
                temperature: number;
                max_tokens: number;
                response_format?: { type: 'json_object' };
            }) => Promise<{
                choices: Array<{ message: { content: string | null } }>;
                usage: { total_tokens: number };
            }>;
        };
    };
}

export interface IOpenAIService {
    generateEmbeddings(texts: string[]): Promise<number[][]>;
    generateEmbedding(text: string): Promise<number[]>;
    generateCompletion(messages: Array<{ role: string, content: string }>, options?: {
        temperature?: number;
        max_tokens?: number;
        response_format?: { type: 'json_object' };
    }): Promise<string>;
    generateStructuredCompletion(messages: Array<{ role: string, content: string }>, schema: any): Promise<any>;
    testConnection(): Promise<boolean>;
}

/**
 * OpenAI Service with Dependency Injection
 * 
 * Handles OpenAI API calls for embeddings and LLM operations.
 * Provides methods for generating embeddings and LLM completions.
 */
export class OpenAIService implements IOpenAIService {
    constructor(
        private client: IOpenAIClient,
        private retryUtil: IRetryUtil,
        private logger: ILogger,
        private embeddingModel: string = 'text-embedding-3-small',
        private llmModel: string = 'gpt-4o-mini',
        private temperature: number = 0.1
    ) { }

    /**
     * Factory method for production use
     */
    static create(): OpenAIService {
        const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        return new OpenAIService(
            client as any, // Cast to interface
            RetryUtil,
            logger,
            process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
            process.env.LLM_MODEL || 'gpt-4o-mini',
            parseFloat(process.env.LLM_TEMPERATURE || '0.1')
        );
    }

    /**
     * Generate embeddings for text
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        return await this.retryUtil.executeWithRetry(
            async () => {
                this.logger.info({
                    textsCount: texts.length,
                    model: this.embeddingModel
                }, 'Generating OpenAI embeddings');

                const response = await this.client.embeddings.create({
                    model: this.embeddingModel,
                    input: texts,
                    encoding_format: 'float'
                });

                const embeddings = response.data.map(item => item.embedding);

                this.logger.info({
                    embeddingsCount: embeddings.length,
                    dimension: embeddings[0]?.length || 0
                }, 'OpenAI embeddings generated successfully');

                return embeddings;
            },
            {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000,
                operationName: 'OpenAI embeddings generation'
            }
        );
    }

    /**
     * Generate single embedding for text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const embeddings = await this.generateEmbeddings([text]);
            return embeddings[0];
        } catch (error: any) {
            this.logger.error('Failed to generate single OpenAI embedding:', error);
            throw new Error(`OpenAI single embedding generation failed: ${error.message}`);
        }
    }

    /**
     * Generate LLM completion
     */
    async generateCompletion(messages: Array<{ role: string, content: string }>, options?: {
        temperature?: number;
        max_tokens?: number;
        response_format?: { type: 'json_object' };
    }): Promise<string> {
        return await this.retryUtil.executeWithRetry(
            async () => {
                this.logger.info({
                    messagesCount: messages.length,
                    model: this.llmModel,
                    temperature: options?.temperature || this.temperature
                }, 'Generating OpenAI completion');

                const response = await this.client.chat.completions.create({
                    model: this.llmModel,
                    messages: messages as any,
                    temperature: options?.temperature || this.temperature,
                    max_tokens: options?.max_tokens || 2000,
                    response_format: options?.response_format
                });

                const content = response.choices[0]?.message?.content;
                if (!content) {
                    throw new Error('No content returned from OpenAI');
                }

                this.logger.info({
                    tokensUsed: response.usage?.total_tokens || 0,
                    contentLength: content.length
                }, 'OpenAI completion generated successfully');

                return content;
            },
            {
                maxAttempts: 3,
                baseDelay: 1000,
                maxDelay: 5000,
                operationName: 'OpenAI completion generation'
            }
        );
    }

    /**
     * Generate structured JSON completion
     */
    async generateStructuredCompletion(messages: Array<{ role: string, content: string }>, schema: any): Promise<any> {
        try {
            const content = await this.generateCompletion(messages, {
                response_format: { type: 'json_object' }
            });

            // Parse JSON response
            const parsed = JSON.parse(content);

            this.logger.info({
                parsedKeys: Object.keys(parsed)
            }, 'Structured completion parsed successfully');

            return parsed;

        } catch (error: any) {
            this.logger.error('Failed to generate structured completion:', error);
            throw new Error(`Structured completion generation failed: ${error.message}`);
        }
    }

    /**
     * Test OpenAI connection
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.generateEmbedding('test');
            this.logger.info({}, 'OpenAI connection test successful');
            return true;
        } catch (error: any) {
            this.logger.error('OpenAI connection test failed:', error);
            return false;
        }
    }
}

// Singleton instance
let openaiService: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
    if (!openaiService) {
        openaiService = OpenAIService.create();
    }
    return openaiService;
}
