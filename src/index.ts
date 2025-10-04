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
        endpoints: ["/upload", "/evaluate", "/result/:id", "/health"]
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
            logger.info("  POST /upload - Upload CV and project files");
            logger.info("  POST /evaluate - Start evaluation (async)");
            logger.info("  GET /result/:id - Get evaluation results");
            logger.info("  POST /ingest/document - Ingest ground-truth document");
            logger.info("  POST /ingest/directory - Ingest all PDFs from directory");
            logger.info("  GET /ingest/documents - List all documents");
            logger.info("  GET /ingest/test - Test RAG system");
            logger.info("  GET /health - Health check");
            logger.info("Queue system: BullMQ with Redis");
            logger.info("Vector database: Qdrant");
        });
    } catch (error: any) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
