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
        // Start a database transaction
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

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

            // Create document record within transaction
            const document = await queryRunner.manager.save(Document, {
                type: documentType,
                version,
                storage_uri: filePath
            });

            // Chunk text
            const chunks = this.chunkText(text, 512, 64); // 512 tokens with 64 overlap

            // Generate embeddings for each chunk
            const embeddings = await this.generateEmbeddings(chunks);

            // Prepare points for vector database
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

            // Try to store in vector database first
            await this.vectorDb.upsertPoints(points);

            // If vector database succeeds, store embedding references in PostgreSQL
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

            await queryRunner.manager.save(Embedding, embeddingRefs);

            // Commit the transaction
            await queryRunner.commitTransaction();

            logger.info({
                documentId: document.id,
                chunksCount: chunks.length,
                embeddingsCount: embeddings.length
            }, 'Document processing completed successfully');

            return document;

        } catch (error: any) {
            // Rollback the transaction
            await queryRunner.rollbackTransaction();

            logger.error({
                filePath,
                documentType,
                error: error.message
            }, 'Document processing failed, transaction rolled back');

            throw new Error(`Document processing failed: ${error.message}`);
        } finally {
            // Release the query runner
            await queryRunner.release();
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
        const documents: Document[] = [];
        const failedFiles: string[] = [];

        try {
            const files = fs.readdirSync(directoryPath);

            for (const file of files) {
                if (file.endsWith('.pdf')) {
                    try {
                        const filePath = path.join(directoryPath, file);
                        const documentType = this.inferDocumentType(file);

                        const document = await this.processDocument(filePath, documentType);
                        documents.push(document);

                        logger.info({
                            file,
                            documentId: document.id,
                            documentType
                        }, 'File processed successfully');

                    } catch (error: any) {
                        failedFiles.push(file);
                        logger.error({
                            file,
                            error: error.message
                        }, 'Failed to process file');

                        // Continue processing other files
                    }
                }
            }

            logger.info({
                directoryPath,
                processedCount: documents.length,
                failedCount: failedFiles.length,
                failedFiles
            }, 'Directory processing completed');

            if (failedFiles.length > 0) {
                logger.warn({
                    failedFiles
                }, 'Some files failed to process');
            }

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
        } else if (lowerFilename.includes('cv')) {
            return 'cv_rubric';
        } else if (lowerFilename.includes('project')) {
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
        // Start a database transaction
        const queryRunner = AppDataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            // Delete from vector database first
            await this.vectorDb.deletePoints({
                must: [
                    {
                        key: 'document_id',
                        match: { value: documentId }
                    }
                ]
            });

            // If vector database deletion succeeds, delete from PostgreSQL
            await queryRunner.manager.delete(Embedding, { docId: documentId });
            await queryRunner.manager.delete(Document, documentId);

            // Commit the transaction
            await queryRunner.commitTransaction();

            logger.info({
                documentId
            }, 'Document deleted successfully');

        } catch (error: any) {
            // Rollback the transaction
            await queryRunner.rollbackTransaction();

            logger.error({
                documentId,
                error: error.message
            }, 'Failed to delete document, transaction rolled back');

            throw new Error(`Failed to delete document: ${error.message}`);
        } finally {
            // Release the query runner
            await queryRunner.release();
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

    /**
     * Clean up orphaned records (documents without corresponding vectors)
     */
    async cleanupOrphanedRecords(): Promise<{
        orphanedDocuments: number;
        orphanedEmbeddings: number;
        cleanedUp: boolean;
    }> {
        try {
            logger.info('Starting orphaned records cleanup');

            // Get all documents
            const documents = await this.documentRepository.find();
            const orphanedDocuments: number[] = [];
            const orphanedEmbeddings: number[] = [];

            for (const doc of documents) {
                try {
                    // Check if document has vectors in Qdrant
                    const stats = await this.vectorDb.getCollectionStats();
                    if (stats.pointsCount === 0) {
                        // No vectors in Qdrant, mark as orphaned
                        orphanedDocuments.push(doc.id);

                        // Find orphaned embeddings
                        const embeddings = await this.embeddingRepository.find({
                            where: { docId: doc.id }
                        });
                        orphanedEmbeddings.push(...embeddings.map(e => e.id));
                    }
                } catch (error: any) {
                    logger.warn({
                        documentId: doc.id,
                        error: error.message
                    }, 'Could not verify document vectors');
                }
            }

            // Delete orphaned records
            if (orphanedDocuments.length > 0) {
                await this.documentRepository.delete(orphanedDocuments);
                await this.embeddingRepository.delete(orphanedEmbeddings);
            }

            logger.info({
                orphanedDocuments: orphanedDocuments.length,
                orphanedEmbeddings: orphanedEmbeddings.length
            }, 'Orphaned records cleanup completed');

            return {
                orphanedDocuments: orphanedDocuments.length,
                orphanedEmbeddings: orphanedEmbeddings.length,
                cleanedUp: orphanedDocuments.length > 0
            };

        } catch (error: any) {
            logger.error('Failed to cleanup orphaned records:', error);
            throw new Error(`Failed to cleanup orphaned records: ${error.message}`);
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
