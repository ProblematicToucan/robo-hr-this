import OpenAI from 'openai';
import { logger } from '../config/logger';

/**
 * OpenAI Service
 * 
 * Handles OpenAI API calls for embeddings and LLM operations.
 * Provides methods for generating embeddings and LLM completions.
 */
export class OpenAIService {
    private client: OpenAI;
    private embeddingModel: string;
    private llmModel: string;
    private temperature: number;

    constructor() {
        this.client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });

        this.embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
        this.llmModel = process.env.LLM_MODEL || 'gpt-4o-mini';
        this.temperature = parseFloat(process.env.LLM_TEMPERATURE || '0.1');
    }

    /**
     * Generate embeddings for text
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        try {
            logger.info({
                textsCount: texts.length,
                model: this.embeddingModel
            }, 'Generating OpenAI embeddings');

            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: texts,
                encoding_format: 'float'
            });

            const embeddings = response.data.map(item => item.embedding);

            logger.info({
                embeddingsCount: embeddings.length,
                dimension: embeddings[0]?.length || 0
            }, 'OpenAI embeddings generated successfully');

            return embeddings;

        } catch (error: any) {
            logger.error('Failed to generate OpenAI embeddings:', error);
            throw new Error(`OpenAI embedding generation failed: ${error.message}`);
        }
    }

    /**
     * Generate single embedding for text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        try {
            const embeddings = await this.generateEmbeddings([text]);
            return embeddings[0];
        } catch (error: any) {
            logger.error('Failed to generate single OpenAI embedding:', error);
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
        try {
            logger.info({
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

            logger.info({
                tokensUsed: response.usage?.total_tokens || 0,
                contentLength: content.length
            }, 'OpenAI completion generated successfully');

            return content;

        } catch (error: any) {
            logger.error('Failed to generate OpenAI completion:', error);
            throw new Error(`OpenAI completion generation failed: ${error.message}`);
        }
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

            logger.info({
                parsedKeys: Object.keys(parsed)
            }, 'Structured completion parsed successfully');

            return parsed;

        } catch (error: any) {
            logger.error('Failed to generate structured completion:', error);
            throw new Error(`Structured completion generation failed: ${error.message}`);
        }
    }

    /**
     * Test OpenAI connection
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.generateEmbedding('test');
            logger.info('OpenAI connection test successful');
            return true;
        } catch (error: any) {
            logger.error('OpenAI connection test failed:', error);
            return false;
        }
    }
}

// Singleton instance
let openaiService: OpenAIService | null = null;

export function getOpenAIService(): OpenAIService {
    if (!openaiService) {
        openaiService = new OpenAIService();
    }
    return openaiService;
}
