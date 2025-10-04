import { Router, Request, Response } from "express";
import { z } from "zod";
import { getDocumentProcessorService } from "../services/document-processor.service";
import { getRAGService } from "../services/rag.service";
import { logger } from "../config/logger";

const router = Router();

// Validation schema for ingest request
const ingestSchema = z.object({
    documentPath: z.string().min(1, "Document path is required"),
    documentType: z.enum(['job_description', 'case_brief', 'cv_rubric', 'project_rubric']),
    version: z.string().optional().default('1.0')
});

/**
 * POST /ingest/document
 * 
 * Process a single document and store embeddings.
 * Body: { documentPath: string, documentType: string, version?: string }
 */
router.post('/document', async (req: Request, res: Response) => {
    try {
        const validatedData = ingestSchema.parse(req.body);
        const { documentPath, documentType, version } = validatedData;

        const documentProcessor = getDocumentProcessorService();
        const document = await documentProcessor.processDocument(
            documentPath,
            documentType,
            version
        );

        logger.info({
            documentId: document.id,
            documentType,
            documentPath
        }, 'Document ingested successfully');

        res.json({
            success: true,
            document: {
                id: document.id,
                type: document.type,
                version: document.version,
                storage_uri: document.storage_uri,
                created_at: document.created_at
            }
        });

    } catch (error: any) {
        logger.error('Document ingestion failed:', error);
        res.status(500).json({
            error: 'Document ingestion failed',
            message: error.message
        });
    }
});

/**
 * POST /ingest/directory
 * 
 * Process all PDF documents in a directory.
 * Body: { directoryPath: string }
 */
router.post('/directory', async (req: Request, res: Response) => {
    try {
        const { directoryPath } = req.body;

        if (!directoryPath) {
            return res.status(400).json({
                error: 'Directory path is required'
            });
        }

        const documentProcessor = getDocumentProcessorService();
        const documents = await documentProcessor.processDirectory(directoryPath);

        logger.info({
            directoryPath,
            documentsCount: documents.length
        }, 'Directory ingestion completed');

        res.json({
            success: true,
            documents: documents.map(doc => ({
                id: doc.id,
                type: doc.type,
                version: doc.version,
                storage_uri: doc.storage_uri,
                created_at: doc.created_at
            })),
            count: documents.length
        });

    } catch (error: any) {
        logger.error('Directory ingestion failed:', error);
        res.status(500).json({
            error: 'Directory ingestion failed',
            message: error.message
        });
    }
});

/**
 * GET /ingest/documents
 * 
 * Get all processed documents.
 */
router.get('/documents', async (req: Request, res: Response) => {
    try {
        const documentProcessor = getDocumentProcessorService();
        const documents = await documentProcessor.getAllDocuments();
        const stats = await documentProcessor.getDocumentStats();

        res.json({
            success: true,
            documents: documents.map(doc => ({
                id: doc.id,
                type: doc.type,
                version: doc.version,
                storage_uri: doc.storage_uri,
                created_at: doc.created_at
            })),
            stats
        });

    } catch (error: any) {
        logger.error('Failed to get documents:', error);
        res.status(500).json({
            error: 'Failed to get documents',
            message: error.message
        });
    }
});

/**
 * DELETE /ingest/documents/:id
 * 
 * Delete a document and its embeddings.
 */
router.delete('/documents/:id', async (req: Request, res: Response) => {
    try {
        const documentId = parseInt(req.params.id);

        if (isNaN(documentId)) {
            return res.status(400).json({
                error: 'Invalid document ID'
            });
        }

        const documentProcessor = getDocumentProcessorService();
        await documentProcessor.deleteDocument(documentId);

        logger.info({
            documentId
        }, 'Document deleted successfully');

        res.json({
            success: true,
            message: 'Document deleted successfully'
        });

    } catch (error: any) {
        logger.error('Failed to delete document:', error);
        res.status(500).json({
            error: 'Failed to delete document',
            message: error.message
        });
    }
});

/**
 * GET /ingest/test
 * 
 * Test RAG system with sample queries.
 */
router.get('/test', async (req: Request, res: Response) => {
    try {
        const ragService = getRAGService();
        const testResults = await ragService.testRAGSystem();
        const stats = await ragService.getRAGStats();

        res.json({
            success: true,
            testResults,
            stats
        });

    } catch (error: any) {
        logger.error('RAG system test failed:', error);
        res.status(500).json({
            error: 'RAG system test failed',
            message: error.message
        });
    }
});

/**
 * POST /ingest/cleanup
 * 
 * Clean up orphaned records (documents without corresponding vectors).
 */
router.post('/cleanup', async (req: Request, res: Response) => {
    try {
        const documentProcessor = getDocumentProcessorService();
        const cleanupResult = await documentProcessor.cleanupOrphanedRecords();

        logger.info({
            cleanupResult
        }, 'Orphaned records cleanup completed');

        res.json({
            success: true,
            message: 'Orphaned records cleanup completed',
            result: cleanupResult
        });

    } catch (error: any) {
        logger.error('Cleanup failed:', error);
        res.status(500).json({
            error: 'Cleanup failed',
            message: error.message
        });
    }
});

/**
 * POST /ingest/update
 * 
 * Update an existing document with new version.
 * Body: { documentId: number, filePath: string, newVersion: string }
 */
router.post('/update', async (req: Request, res: Response) => {
    try {
        const { documentId, filePath, newVersion } = req.body;

        if (!documentId || !filePath || !newVersion) {
            return res.status(400).json({
                error: 'documentId, filePath, and newVersion are required'
            });
        }

        const documentProcessor = getDocumentProcessorService();

        // Get existing document
        const existingDocument = await documentProcessor.getAllDocuments();
        const document = existingDocument.find(doc => doc.id === documentId);

        if (!document) {
            return res.status(404).json({
                error: 'Document not found'
            });
        }

        // Update document
        const updatedDocument = await documentProcessor.updateDocument(document, filePath, newVersion);

        logger.info({
            documentId: updatedDocument.id,
            newVersion,
            filePath
        }, 'Document updated successfully');

        res.json({
            success: true,
            message: 'Document updated successfully',
            document: {
                id: updatedDocument.id,
                type: updatedDocument.type,
                version: updatedDocument.version,
                storage_uri: updatedDocument.storage_uri,
                updated_at: updatedDocument.updated_at
            }
        });

    } catch (error: any) {
        logger.error('Document update failed:', error);
        res.status(500).json({
            error: 'Document update failed',
            message: error.message
        });
    }
});

export { router as ingestRoutes };
