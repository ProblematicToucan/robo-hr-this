import { Router, Request, Response } from "express";
import { z } from "zod";
import { AppDataSource } from "../db/data-source";
import { Job } from "../db/entities/job.entity";
import { JobArtifact } from "../db/entities/job-artifact.entity";
import { File } from "../db/entities/file.entity";
import { logger } from "../config/logger";
import {
    CVEvaluationPayload,
    ProjectEvaluationPayload,
    FinalSynthesisPayload
} from "../types/evaluation";

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

        // SIMPLE MOCK EVALUATION (no queue, immediate processing)
        try {
            // Mark as processing
            job.status = 'processing';
            await jobRepository.save(job);

            // Create mock results for each stage
            const artifactRepository = AppDataSource.getRepository(JobArtifact);

            // Stage S1: CV Evaluation
            const s1Payload: CVEvaluationPayload = {
                parameters: {
                    technical_skills: 4,
                    experience_level: 5,
                    relevant_achievements: 4,
                    cultural_fit: 4
                },
                weighted_average_1_to_5: 4.25,
                cv_match_rate: 0.85,
                cv_feedback: "Strong technical background with relevant experience. Good cultural fit indicators."
            };

            await artifactRepository.save({
                jobId: job.id,
                stage: 'S1',
                payload_json: s1Payload,
                version: "1.0"
            });

            // Stage S2: Project Evaluation
            const s2Payload: ProjectEvaluationPayload = {
                parameters: {
                    correctness: 4,
                    code_quality: 4,
                    resilience: 3,
                    documentation: 4,
                    creativity: 4
                },
                project_score: 3.8,
                project_feedback: "Well-architected solution with good code quality. Documentation could be improved."
            };

            await artifactRepository.save({
                jobId: job.id,
                stage: 'S2',
                payload_json: s2Payload,
                version: "1.0"
            });

            // Stage S3: Final Synthesis
            const s3Payload: FinalSynthesisPayload = {
                overall_summary: "Strong candidate with excellent technical skills and good project execution. Recommended for the role."
            };

            await artifactRepository.save({
                jobId: job.id,
                stage: 'S3',
                payload_json: s3Payload,
                version: "1.0"
            });

            // Mark as completed
            job.status = 'completed';
            await jobRepository.save(job);

            logger.info({
                jobId: job.id,
                status: 'completed'
            }, 'Mock evaluation completed');

        } catch (error) {
            // Mark as failed
            job.status = 'failed';
            job.error_code = 'mock_evaluation_error';
            await jobRepository.save(job);

            logger.error({
                jobId: job.id,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Mock evaluation failed');
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
