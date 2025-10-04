import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import pdf from 'pdf-parse';
import { AppDataSource } from '../db/data-source';
import { Document } from '../db/entities/document.entity';
import { Embedding } from '../db/entities/embedding.entity';
import { getVectorDbService, IVectorDbService } from './vector-db.service';
import { getOpenAIService, IOpenAIService } from './openai.service';
import { logger, ILogger } from '../config/logger';
import { RetryUtil, IRetryUtil } from '../utils/retry.util';
import { IDataSource, IRepository, IQueryRunner } from '../db/interfaces';

/**
 * Document Processor Service with Dependency Injection
 * 
 * Handles PDF parsing, text chunking, and embedding generation.
 * Processes ground-truth documents for RAG system.
 */
export class DocumentProcessorService {
    constructor(
        private dataSource: IDataSource,
        private vectorDb: IVectorDbService,
        private openai: IOpenAIService,
        private retryUtil: IRetryUtil,
        private logger: ILogger
    ) { }

    /**
     * Factory method for production use
     */
    static create(): DocumentProcessorService {
        return new DocumentProcessorService(
            AppDataSource as any, // Cast to interface
            getVectorDbService(),
            getOpenAIService(),
            RetryUtil,
            logger
        );
    }

    private get documentRepository() {
        return this.dataSource.getRepository(Document);
    }

    private get embeddingRepository() {
        return this.dataSource.getRepository(Embedding);
    }

    /**
     * Calculate content hash for a file
     */
    private calculateContentHash(filePath: string): string {
        const fileBuffer = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(fileBuffer).digest('hex');
    }

    /**
     * Check if document already exists with same content
     */
    private async findExistingDocument(documentType: string, contentHash: string): Promise<Document | null> {
        try {
            return await this.documentRepository.findOne({
                where: {
                    type: documentType,
                    content_hash: contentHash
                }
            }) as Document | null;
        } catch (error: any) {
            this.logger.warn('Failed to check existing document:', error);
            return null;
        }
    }

    /**
     * Process a PDF document and store embeddings
     */
    async processDocument(filePath: string, documentType: string, version: string = '1.0'): Promise<Document> {
        // Start a database transaction
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.info({
                filePath,
                documentType,
                version
            }, 'Starting document processing');

            // Calculate content hash
            const contentHash = this.calculateContentHash(filePath);

            // Check if document already exists with same content
            const existingDocument = await this.findExistingDocument(documentType, contentHash);

            if (existingDocument) {
                this.logger.info({
                    documentId: existingDocument.id,
                    documentType,
                    contentHash: contentHash.substring(0, 8) + '...',
                    filePath
                }, 'Document already exists with same content, skipping processing');

                await queryRunner.rollbackTransaction();
                return existingDocument;
            }

            // Parse PDF
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(pdfBuffer);
            const text = pdfData.text;

            if (!text || text.trim().length === 0) {
                throw new Error('PDF contains no extractable text');
            }

            // Create document record within transaction with retry
            const document = await this.retryUtil.executeWithRetry(
                async () => {
                    return await queryRunner.manager.save(Document, {
                        type: documentType,
                        version,
                        storage_uri: filePath,
                        content_hash: contentHash
                    });
                },
                {
                    maxAttempts: 3,
                    baseDelay: 500,
                    maxDelay: 2000,
                    operationName: 'Save document to database'
                }
            );

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

            this.logger.info({
                documentId: document.id,
                chunksCount: chunks.length,
                embeddingsCount: embeddings.length
            }, 'Document processing completed successfully');

            return document;

        } catch (error: any) {
            // Rollback the transaction
            await queryRunner.rollbackTransaction();

            this.logger.error('Document processing failed, transaction rolled back', {
                filePath,
                documentType,
                error: error.message
            });

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
     * Generate embeddings for text chunks using OpenAI
     */
    private async generateEmbeddings(chunks: string[]): Promise<Array<{ vector: number[] }>> {
        this.logger.info({
            chunksCount: chunks.length
        }, 'Generating OpenAI embeddings for chunks');

        // Generate real embeddings using OpenAI - throw error if fails
        const embeddings = await this.openai.generateEmbeddings(chunks);

        const result = embeddings.map(embedding => ({
            vector: embedding
        }));

        this.logger.info({
            chunksCount: chunks.length,
            embeddingDimension: embeddings[0]?.length || 0
        }, 'OpenAI embeddings generated successfully');

        return result;
    }


    /**
     * Update existing document with new version
     */
    async updateDocument(existingDocument: Document, filePath: string, newVersion: string): Promise<Document> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        await queryRunner.startTransaction();

        try {
            this.logger.info({
                documentId: existingDocument.id,
                oldVersion: existingDocument.version,
                newVersion,
                filePath
            }, 'Updating existing document');

            // Calculate new content hash
            const contentHash = this.calculateContentHash(filePath);

            // Parse PDF
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdf(pdfBuffer);
            const text = pdfData.text;

            if (!text || text.trim().length === 0) {
                throw new Error('PDF contains no extractable text');
            }

            // Update document record
            existingDocument.version = newVersion;
            existingDocument.storage_uri = filePath;
            existingDocument.content_hash = contentHash;

            const updatedDocument = await queryRunner.manager.save(Document, existingDocument);

            // Delete old embeddings from vector database
            await this.vectorDb.deletePoints({
                must: [
                    {
                        key: 'document_id',
                        match: { value: existingDocument.id }
                    }
                ]
            });

            // Delete old embedding references
            await queryRunner.manager.delete(Embedding, { docId: existingDocument.id });

            // Chunk text
            const chunks = this.chunkText(text, 512, 64);

            // Generate embeddings for each chunk
            const embeddings = await this.generateEmbeddings(chunks);

            // Store new embeddings in vector database
            const points = embeddings.map((embedding, index) => ({
                id: `${updatedDocument.id}_${index}`,
                vector: embedding.vector,
                payload: {
                    document_id: updatedDocument.id,
                    document_type: updatedDocument.type,
                    chunk_index: index,
                    chunk_text: chunks[index],
                    version: newVersion,
                    created_at: new Date().toISOString()
                }
            }));

            await this.vectorDb.upsertPoints(points);

            // Store new embedding references
            const embeddingRefs = embeddings.map((embedding, index) => {
                const ref = new Embedding();
                ref.docId = updatedDocument.id;
                ref.chunk_id = `${updatedDocument.id}_${index}`;
                ref.vector_ref = `${updatedDocument.id}_${index}`;
                ref.metadata = {
                    chunk_index: index,
                    chunk_text: chunks[index],
                    document_type: updatedDocument.type,
                    version: newVersion
                };
                return ref;
            });

            await queryRunner.manager.save(Embedding, embeddingRefs);

            // Commit the transaction
            await queryRunner.commitTransaction();

            this.logger.info({
                documentId: updatedDocument.id,
                chunksCount: chunks.length,
                embeddingsCount: embeddings.length
            }, 'Document updated successfully');

            return updatedDocument;

        } catch (error: any) {
            await queryRunner.rollbackTransaction();
            this.logger.error('Document update failed:', error);
            throw new Error(`Document update failed: ${error.message}`);
        } finally {
            await queryRunner.release();
        }
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

                        this.logger.info({
                            file,
                            documentId: document.id,
                            documentType
                        }, 'File processed successfully');

                    } catch (error: any) {
                        failedFiles.push(file);
                        this.logger.error('Failed to process file', {
                            file,
                            error: error.message
                        });

                        // Continue processing other files
                    }
                }
            }

            this.logger.info({
                directoryPath,
                processedCount: documents.length,
                failedCount: failedFiles.length,
                failedFiles
            }, 'Directory processing completed');

            if (failedFiles.length > 0) {
                this.logger.warn('Some files failed to process', {
                    failedFiles
                });
            }

            return documents;

        } catch (error: any) {
            this.logger.error('Directory processing failed:', error);
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
            }) as Document[];
        } catch (error: any) {
            this.logger.error('Failed to get documents:', error);
            throw new Error(`Failed to get documents: ${error.message}`);
        }
    }

    /**
     * Delete a document and its embeddings
     */
    async deleteDocument(documentId: number): Promise<void> {
        // Start a database transaction
        const queryRunner = this.dataSource.createQueryRunner();
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

            this.logger.info({
                documentId
            }, 'Document deleted successfully');

        } catch (error: any) {
            // Rollback the transaction
            await queryRunner.rollbackTransaction();

            this.logger.error('Failed to delete document, transaction rolled back', {
                documentId,
                error: error.message
            });

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
            const documents = await this.documentRepository.find() as Document[];
            const embeddings = await this.embeddingRepository.find() as Embedding[];

            const documentsByType = documents.reduce((acc: Record<string, number>, doc: Document) => {
                acc[doc.type] = (acc[doc.type] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);

            return {
                totalDocuments: documents.length,
                totalEmbeddings: embeddings.length,
                documentsByType
            };

        } catch (error: any) {
            this.logger.error('Failed to get document stats:', error);
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
            this.logger.info({}, 'Starting orphaned records cleanup');

            // Get all documents
            const documents = await this.documentRepository.find() as Document[];
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
                        }) as Embedding[];
                        orphanedEmbeddings.push(...embeddings.map((e: Embedding) => e.id));
                    }
                } catch (error: any) {
                    this.logger.warn('Could not verify document vectors', {
                        documentId: doc.id,
                        error: error.message
                    });
                }
            }

            // Delete orphaned records
            if (orphanedDocuments.length > 0) {
                await this.documentRepository.delete(orphanedDocuments);
                await this.embeddingRepository.delete(orphanedEmbeddings);
            }

            this.logger.info({
                orphanedDocuments: orphanedDocuments.length,
                orphanedEmbeddings: orphanedEmbeddings.length
            }, 'Orphaned records cleanup completed');

            return {
                orphanedDocuments: orphanedDocuments.length,
                orphanedEmbeddings: orphanedEmbeddings.length,
                cleanedUp: orphanedDocuments.length > 0
            };

        } catch (error: any) {
            this.logger.error('Failed to cleanup orphaned records:', error);
            throw new Error(`Failed to cleanup orphaned records: ${error.message}`);
        }
    }
}

// Singleton instance
let documentProcessorService: DocumentProcessorService | null = null;

export function getDocumentProcessorService(): DocumentProcessorService {
    if (!documentProcessorService) {
        documentProcessorService = DocumentProcessorService.create();
    }
    return documentProcessorService;
}
