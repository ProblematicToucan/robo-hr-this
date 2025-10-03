import express, { Request, Response } from "express";
import { config } from "dotenv";
import { AppDataSource } from "./db/data-source";
import { uploadRoutes } from "./routes/upload";
import { evaluateRoutes } from "./routes/evaluate";
import { resultRoutes } from "./routes/result";
import { logger } from "./config/logger";

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

        // Start server
        app.listen(PORT, () => {
            logger.info(`Server running at http://localhost:${PORT}`);
            logger.info("Available endpoints:");
            logger.info("  POST /upload - Upload CV and project files");
            logger.info("  POST /evaluate - Start evaluation");
            logger.info("  GET /result/:id - Get evaluation results");
            logger.info("  GET /health - Health check");
        });
    } catch (error: any) {
        logger.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
