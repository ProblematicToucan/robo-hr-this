import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';
import { AppDataSource } from '../db/data-source';
import { Document } from '../db/entities/document.entity';
import { Embedding } from '../db/entities/embedding.entity';
import { getVectorDbService } from './vector-db.service';
import { logger } from '../config/logger';

/**
 * Document Processor Service
 * 
 * Handles PDF parsing, text chunking, and embedding generation.
 * Processes ground-truth documents for RAG system.
 */
export class DocumentProcessorService {
    private documentRepository = AppDataSource.getRepository(Document);
    private embeddingRepository = AppDataSource.getRepository(Embedding);
    private vectorDb = getVectorDbService();

    /**
     * Process a PDF document and store embeddings
     */
    async processDocument(filePath: string, documentType: string, version: string = '1.0'): Promise<Document> {
        try {
            logger.info({
                filePath,
                documentType,
                version
            }, 'Starting document processing');

            // Parse PDF
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(pdfBuffer);
            const text = pdfData.text;

            if (!text || text.trim().length === 0) {
                throw new Error('PDF contains no extractable text');
            }

            // Create document record
            const document = await this.documentRepository.save({
                type: documentType,
                version,
                storage_uri: filePath
            });

            // Chunk text
            const chunks = this.chunkText(text, 512, 64); // 512 tokens with 64 overlap

            // Generate embeddings for each chunk
            const embeddings = await this.generateEmbeddings(chunks);

            // Store embeddings in vector database
            const points = embeddings.map((embedding, index) => ({
                id: `${document.id}_${index}`,
                vector: embedding.vector,
                payload: {
                    document_id: document.id,
                    document_type: documentType,
                    chunk_index: index,
                    chunk_text: chunks[index],
                    version,
                    created_at: new Date().toISOString()
                }
            }));

            await this.vectorDb.upsertPoints(points);

            // Store embedding references in PostgreSQL
            const embeddingRefs = embeddings.map((embedding, index) => {
                const ref = new Embedding();
                ref.docId = document.id;
                ref.chunk_id = `${document.id}_${index}`;
                ref.vector_ref = `${document.id}_${index}`;
                ref.metadata = {
                    chunk_index: index,
                    chunk_text: chunks[index],
                    document_type: documentType,
                    version
                };
                return ref;
            });

            await this.embeddingRepository.save(embeddingRefs);

            logger.info({
                documentId: document.id,
                chunksCount: chunks.length,
                embeddingsCount: embeddings.length
            }, 'Document processing completed');

            return document;

        } catch (error: any) {
            logger.error('Document processing failed:', error);
            throw new Error(`Document processing failed: ${error.message}`);
        }
    }

    /**
     * Chunk text into smaller pieces for embedding
     */
    private chunkText(text: string, chunkSize: number = 512, overlap: number = 64): string[] {
        const words = text.split(/\s+/);
        const chunks: string[] = [];

        for (let i = 0; i < words.length; i += chunkSize - overlap) {
            const chunk = words.slice(i, i + chunkSize).join(' ');
            if (chunk.trim().length > 0) {
                chunks.push(chunk.trim());
            }
        }

        return chunks;
    }

    /**
     * Generate embeddings for text chunks
     * TODO: Replace with real OpenAI embedding generation
     */
    private async generateEmbeddings(chunks: string[]): Promise<Array<{ vector: number[] }>> {
        // For now, generate mock embeddings
        // In production, this would call OpenAI's embedding API
        const embeddings = chunks.map(() => ({
            vector: Array.from({ length: 1536 }, () => Math.random() * 2 - 1) // Mock 1536-dim vector
        }));

        logger.info({
            chunksCount: chunks.length,
            embeddingDimension: 1536
        }, 'Mock embeddings generated');

        return embeddings;
    }

    /**
     * Process all documents in a directory
     */
    async processDirectory(directoryPath: string): Promise<Document[]> {
        try {
            const documents: Document[] = [];
            const files = fs.readdirSync(directoryPath);

            for (const file of files) {
                if (file.endsWith('.pdf')) {
                    const filePath = path.join(directoryPath, file);
                    const documentType = this.inferDocumentType(file);

                    const document = await this.processDocument(filePath, documentType);
                    documents.push(document);
                }
            }

            logger.info({
                directoryPath,
                processedCount: documents.length
            }, 'Directory processing completed');

            return documents;

        } catch (error: any) {
            logger.error('Directory processing failed:', error);
            throw new Error(`Directory processing failed: ${error.message}`);
        }
    }

    /**
     * Infer document type from filename
     */
    private inferDocumentType(filename: string): string {
        const lowerFilename = filename.toLowerCase();

        if (lowerFilename.includes('job') || lowerFilename.includes('jd')) {
            return 'job_description';
        } else if (lowerFilename.includes('case') || lowerFilename.includes('brief')) {
            return 'case_brief';
        } else if (lowerFilename.includes('cv') || lowerFilename.includes('rubric')) {
            return 'cv_rubric';
        } else if (lowerFilename.includes('project') || lowerFilename.includes('rubric')) {
            return 'project_rubric';
        } else {
            return 'unknown';
        }
    }

    /**
     * Get all processed documents
     */
    async getAllDocuments(): Promise<Document[]> {
        try {
            return await this.documentRepository.find({
                order: { created_at: 'DESC' }
            });
        } catch (error: any) {
            logger.error('Failed to get documents:', error);
            throw new Error(`Failed to get documents: ${error.message}`);
        }
    }

    /**
     * Delete a document and its embeddings
     */
    async deleteDocument(documentId: number): Promise<void> {
        try {
            // Delete from vector database
            await this.vectorDb.deletePoints({
                must: [
                    {
                        key: 'document_id',
                        match: { value: documentId }
                    }
                ]
            });

            // Delete embedding references
            await this.embeddingRepository.delete({ docId: documentId });

            // Delete document
            await this.documentRepository.delete(documentId);

            logger.info({
                documentId
            }, 'Document deleted successfully');

        } catch (error: any) {
            logger.error('Failed to delete document:', error);
            throw new Error(`Failed to delete document: ${error.message}`);
        }
    }

    /**
     * Get document statistics
     */
    async getDocumentStats(): Promise<{
        totalDocuments: number;
        totalEmbeddings: number;
        documentsByType: Record<string, number>;
    }> {
        try {
            const documents = await this.documentRepository.find();
            const embeddings = await this.embeddingRepository.find();

            const documentsByType = documents.reduce((acc, doc) => {
                acc[doc.type] = (acc[doc.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            return {
                totalDocuments: documents.length,
                totalEmbeddings: embeddings.length,
                documentsByType
            };

        } catch (error: any) {
            logger.error('Failed to get document stats:', error);
            throw new Error(`Failed to get document stats: ${error.message}`);
        }
    }
}

// Singleton instance
let documentProcessorService: DocumentProcessorService | null = null;

export function getDocumentProcessorService(): DocumentProcessorService {
    if (!documentProcessorService) {
        documentProcessorService = new DocumentProcessorService();
    }
    return documentProcessorService;
}
