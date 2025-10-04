import { Router, Request, Response } from "express";
import { AppDataSource } from "../db/data-source";
import { Job } from "../db/entities/job.entity";
import { JobArtifact } from "../db/entities/job-artifact.entity";
import { logger } from "../config/logger";
import {
    CVEvaluationPayload,
    ProjectEvaluationPayload,
    FinalSynthesisPayload,
    EvaluationResult
} from "../types/evaluation";

const router = Router();

/**
 * GET /result/:id
 * 
 * Get evaluation results for a specific job.
 * Returns job status and results (if completed).
 * 
 * Params: id (job ID)
 * Returns: { id: number, status: string, result?: object }
 */
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const jobId = parseInt(req.params.id);

        if (isNaN(jobId)) {
            return res.status(400).json({
                error: 'Invalid job ID'
            });
        }

        const jobRepository = AppDataSource.getRepository(Job);
        const job = await jobRepository.findOne({ where: { id: jobId } });

        if (!job) {
            return res.status(404).json({
                error: 'Job not found'
            });
        }

        // If job is still processing or queued, return status only
        if (job.status === 'queued' || job.status === 'processing') {
            return res.json({
                id: job.id,
                status: job.status
            });
        }

        // If job failed, return error information
        if (job.status === 'failed') {
            return res.status(500).json({
                id: job.id,
                status: job.status,
                error: 'Evaluation failed after maximum retry attempts',
                error_code: job.error_code,
                attempts: job.attempts,
                message: 'The evaluation could not be completed due to service unavailability. Please try again later.'
            });
        }

        // If job is completed, get the results
        if (job.status === 'completed') {
            const artifactRepository = AppDataSource.getRepository(JobArtifact);
            const artifacts = await artifactRepository.find({
                where: { jobId: job.id },
                order: { stage: 'ASC' }
            });

            // Extract results from artifacts
            const s1Artifact = artifacts.find(a => a.stage === 'S1');
            const s2Artifact = artifacts.find(a => a.stage === 'S2');
            const s3Artifact = artifacts.find(a => a.stage === 'S3');

            if (!s1Artifact || !s2Artifact || !s3Artifact) {
                return res.status(500).json({
                    error: 'Incomplete evaluation results'
                });
            }

            // Type cast the payload_json to proper interfaces
            const s1Payload = s1Artifact.payload_json as CVEvaluationPayload;
            const s2Payload = s2Artifact.payload_json as ProjectEvaluationPayload;
            const s3Payload = s3Artifact.payload_json as FinalSynthesisPayload;

            const result: EvaluationResult = {
                cv_match_rate: s1Payload.cv_match_rate,
                cv_feedback: s1Payload.cv_feedback,
                project_score: s2Payload.project_score,
                project_feedback: s2Payload.project_feedback,
                overall_summary: s3Payload.overall_summary
            };

            logger.info({
                jobId: job.id,
                status: 'completed'
            }, 'Results retrieved');

            return res.json({
                id: job.id,
                status: job.status,
                result: result
            });
        }

        // Fallback for unknown status
        return res.json({
            id: job.id,
            status: job.status
        });

    } catch (error: any) {
        logger.error('Result retrieval failed:', error);
        res.status(500).json({
            error: 'Result retrieval failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export { router as resultRoutes };
