import express, { Request, Response } from "express";
import { config } from "dotenv";
import { AppDataSource } from "./db/data-source";
import { uploadRoutes } from "./routes/upload";
import { evaluateRoutes } from "./routes/evaluate";
import { resultRoutes } from "./routes/result";
import { ingestRoutes } from "./routes/ingest";
import { logger } from "./config/logger";
import { getQueueConfig } from "./queue/queue-config";
import { evaluationProcessor } from "./workers/evaluation-worker";
import { getVectorDbService } from "./services/vector-db.service";
import { getDocumentProcessorService } from "./services/document-processor.service";
import { getRAGService } from "./services/rag.service";
import { getOpenAIService } from "./services/openai.service";

// Load environment variables
config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/upload", uploadRoutes);
app.use("/evaluate", evaluateRoutes);
app.use("/result", resultRoutes);
app.use("/ingest", ingestRoutes);

// Health check
app.get("/health", (req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Root route
app.get("/", (req: Request, res: Response) => {
    res.json({
        message: "AI-Powered CV & Project Evaluator API",
        version: "1.0.0",
        description: "Automated CV and project evaluation using RAG + LLM chaining",
        endpoints: {
            "File Management": {
                "POST /upload": "Upload CV and project files"
            },
            "Evaluation System": {
                "POST /evaluate": "Start evaluation (async)",
                "GET /result/:id": "Get evaluation results"
            },
            "Document Ingestion": {
                "POST /ingest/document": "Ingest single ground-truth document",
                "POST /ingest/directory": "Ingest all PDFs from directory",
                "GET /ingest/documents": "List all processed documents",
                "DELETE /ingest/documents/:id": "Delete document and embeddings",
                "GET /ingest/test": "Test RAG system with sample queries"
            },
            "System": {
                "GET /health": "Health check",
                "GET /": "API information"
            }
        },
        infrastructure: {
            "Queue System": "BullMQ with Redis",
            "Vector Database": "Qdrant",
            "Database": "PostgreSQL with TypeORM",
            "LLM": "OpenAI (ready for integration)"
        }
    });
});

// Initialize database and start server
async function startServer() {
    try {
        // Initialize database connection
        await AppDataSource.initialize();
        logger.info("Database connection established");

        // Initialize vector database
        const vectorDb = getVectorDbService();
        await vectorDb.initialize();
        logger.info("Vector database (Qdrant) initialized");

        // Initialize document processor
        const documentProcessor = getDocumentProcessorService();
        logger.info("Document processor initialized");

        // Initialize OpenAI service
        const openaiService = getOpenAIService();
        const openaiConnected = await openaiService.testConnection();
        if (openaiConnected) {
            logger.info("OpenAI service initialized and connected");
        } else {
            logger.warn("OpenAI service initialized but connection test failed");
        }

        // Initialize RAG service
        const ragService = getRAGService();
        logger.info("RAG service initialized");

        // Initialize queue system
        const queueConfig = getQueueConfig();
        queueConfig.startWorker(evaluationProcessor);
        logger.info("Queue system initialized and worker started");

        // Start server
        app.listen(PORT, () => {
            logger.info(`Server running at http://localhost:${PORT}`);
            logger.info("Available endpoints:");
            logger.info("📁 File Management:");
            logger.info("  POST /upload - Upload CV and project files");
            logger.info("📊 Evaluation System:");
            logger.info("  POST /evaluate - Start evaluation (async)");
            logger.info("  GET /result/:id - Get evaluation results");
            logger.info("📚 Document Ingestion:");
            logger.info("  POST /ingest/document - Ingest single ground-truth document");
            logger.info("  POST /ingest/directory - Ingest all PDFs from directory");
            logger.info("  GET /ingest/documents - List all processed documents");
            logger.info("  DELETE /ingest/documents/:id - Delete document and embeddings");
            logger.info("  POST /ingest/update - Update existing document with new version");
            logger.info("  GET /ingest/test - Test RAG system with sample queries");
            logger.info("  POST /ingest/cleanup - Clean up orphaned records");
            logger.info("🔧 System:");
            logger.info("  GET /health - Health check");
            logger.info("  GET / - API information");
            logger.info("🚀 Infrastructure:");
            logger.info("  Queue system: BullMQ with Redis");
            logger.info("  Vector database: Qdrant");
            logger.info("  Database: PostgreSQL with TypeORM");
            logger.info("  LLM: OpenAI GPT-4o-mini with text-embedding-3-small");
            logger.info("  Evaluation: 3-stage LLM pipeline (S1: CV, S2: Project, S3: Synthesis)");
        });
    } catch (error: any) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
