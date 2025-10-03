import { Router, Request, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { Job } from "../db/entities/job.entity";
import { File } from "../db/entities/file.entity";
import { logger } from "../config/logger";
import { getQueueConfig } from "../queue/queue-config";

const router = Router();

// Validation schema for evaluate request
const evaluateSchema = z.object({
    jobTitle: z.string().min(1, "Job title is required"),
    cvFileId: z.number().int().positive("CV file ID must be a positive integer"),
    reportFileId: z.number().int().positive("Report file ID must be a positive integer")
});

/**
 * POST /evaluate
 * 
 * Start evaluation process for uploaded CV and project report.
 * Creates a job and immediately processes it with mock results.
 * 
 * Body: { jobTitle: string, cvFileId: number, reportFileId: number }
 * Returns: { id: number, status: string }
 */
router.post('/', async (req: Request, res: Response) => {
    try {
        // Validate request body
        const validatedData = evaluateSchema.parse(req.body);
        const { jobTitle, cvFileId, reportFileId } = validatedData;

        // Verify files exist
        const fileRepository = AppDataSource.getRepository(File);
        const cvFile = await fileRepository.findOne({ where: { id: cvFileId, type: 'cv' } });
        const reportFile = await fileRepository.findOne({ where: { id: reportFileId, type: 'report' } });

        if (!cvFile) {
            return res.status(404).json({ error: 'CV file not found' });
        }
        if (!reportFile) {
            return res.status(404).json({ error: 'Report file not found' });
        }

        // Create job
        const jobRepository = AppDataSource.getRepository(Job);
        const job = await jobRepository.save({
            status: 'queued'
        });

        logger.info({
            jobId: job.id,
            jobTitle,
            cvFileId,
            reportFileId
        }, 'Evaluation job created');

        // Add job to queue for async processing
        try {
            const queueConfig = getQueueConfig();
            const evaluationQueue = queueConfig.getEvaluationQueue();

            await evaluationQueue.add('evaluate', {
                jobId: job.id,
                jobTitle,
                cvFileId,
                reportFileId
            }, {
                priority: 1,
                delay: 0
            });

            logger.info({
                jobId: job.id,
                queueName: 'evaluation'
            }, 'Evaluation job added to queue');

        } catch (error) {
            // Mark as failed if queue operation fails
            job.status = 'failed';
            job.error_code = 'queue_error';
            await jobRepository.save(job);

            logger.error({
                jobId: job.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Failed to add job to queue');
        }

        res.json({
            id: job.id,
            status: job.status
        });

    } catch (error: any) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({
                error: 'Validation failed',
                details: error.errors
            });
        }

        logger.error('Evaluation request failed:', error);
        res.status(500).json({
            error: 'Evaluation request failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export { router as evaluateRoutes };
