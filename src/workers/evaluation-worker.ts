import { Job } from 'bullmq';
import { AppDataSource } from '../db/data-source';
import { Job as JobEntity } from '../db/entities/job.entity';
import { JobArtifact } from '../db/entities/job-artifact.entity';
import { File } from '../db/entities/file.entity';
import { logger } from '../config/logger';
import {
    CVEvaluationPayload,
    ProjectEvaluationPayload,
    FinalSynthesisPayload
} from '../types/evaluation';

/**
 * Evaluation Worker
 * 
 * Processes evaluation jobs asynchronously.
 * Implements the 3-stage evaluation pipeline:
 * S1: CV Evaluation
 * S2: Project Evaluation  
 * S3: Final Synthesis
 */
export class EvaluationWorker {
    private jobRepository = AppDataSource.getRepository(JobEntity);
    private artifactRepository = AppDataSource.getRepository(JobArtifact);
    private fileRepository = AppDataSource.getRepository(File);

    /**
     * Process evaluation job
     */
    async processEvaluation(job: Job) {
        const { jobId, jobTitle, cvFileId, reportFileId } = job.data;

        logger.info({
            jobId,
            jobTitle,
            cvFileId,
            reportFileId,
            workerJobId: job.id
        }, 'Starting evaluation processing');

        try {
            // Update job status to processing
            await this.updateJobStatus(jobId, 'processing');

            // Verify files exist
            const cvFile = await this.fileRepository.findOne({
                where: { id: cvFileId, type: 'cv' }
            });
            const reportFile = await this.fileRepository.findOne({
                where: { id: reportFileId, type: 'report' }
            });

            if (!cvFile || !reportFile) {
                throw new Error('Required files not found');
            }

            // Process each evaluation stage
            await this.processStageS1(jobId, cvFile, jobTitle);
            await this.processStageS2(jobId, reportFile, jobTitle);
            await this.processStageS3(jobId);

            // Mark job as completed
            await this.updateJobStatus(jobId, 'completed');

            logger.info({
                jobId,
                status: 'completed'
            }, 'Evaluation processing completed');

            return { success: true, jobId };

        } catch (error) {
            logger.error({
                jobId,
                error: error instanceof Error ? error.message : 'Unknown error'
            }, 'Evaluation processing failed');

            // Mark job as failed
            await this.updateJobStatus(jobId, 'failed', 'processing_error');

            throw error;
        }
    }

    /**
     * Stage S1: CV Evaluation
     */
    private async processStageS1(jobId: number, cvFile: File, jobTitle: string) {
        logger.info({ jobId, stage: 'S1' }, 'Processing CV evaluation');

        // TODO: Implement real CV parsing and LLM evaluation
        // For now, use mock data
        const s1Payload: CVEvaluationPayload = {
            parameters: {
                technical_skills: 4,
                experience_level: 5,
                relevant_achievements: 4,
                cultural_fit: 4
            },
            weighted_average_1_to_5: 4.25,
            cv_match_rate: 0.85,
            cv_feedback: `Strong technical background with relevant experience for ${jobTitle}. Good cultural fit indicators.`
        };

        await this.artifactRepository.save({
            jobId,
            stage: 'S1',
            payload_json: s1Payload,
            version: "1.0"
        });

        logger.info({ jobId, stage: 'S1' }, 'CV evaluation completed');
    }

    /**
     * Stage S2: Project Evaluation
     */
    private async processStageS2(jobId: number, reportFile: File, jobTitle: string) {
        logger.info({ jobId, stage: 'S2' }, 'Processing project evaluation');

        // TODO: Implement real project report parsing and LLM evaluation
        // For now, use mock data
        const s2Payload: ProjectEvaluationPayload = {
            parameters: {
                correctness: 4,
                code_quality: 4,
                resilience: 3,
                documentation: 4,
                creativity: 4
            },
            project_score: 3.8,
            project_feedback: `Well-architected solution with good code quality for ${jobTitle}. Documentation could be improved.`
        };

        await this.artifactRepository.save({
            jobId,
            stage: 'S2',
            payload_json: s2Payload,
            version: "1.0"
        });

        logger.info({ jobId, stage: 'S2' }, 'Project evaluation completed');
    }

    /**
     * Stage S3: Final Synthesis
     */
    private async processStageS3(jobId: number) {
        logger.info({ jobId, stage: 'S3' }, 'Processing final synthesis');

        // Get previous stage results
        const s1Artifact = await this.artifactRepository.findOne({
            where: { jobId, stage: 'S1' }
        });
        const s2Artifact = await this.artifactRepository.findOne({
            where: { jobId, stage: 'S2' }
        });

        if (!s1Artifact || !s2Artifact) {
            throw new Error('Previous stage results not found for final synthesis');
        }

        // TODO: Implement real LLM synthesis
        // For now, use mock data
        const s3Payload: FinalSynthesisPayload = {
            overall_summary: "Strong candidate with excellent technical skills and good project execution. Recommended for the role."
        };

        await this.artifactRepository.save({
            jobId,
            stage: 'S3',
            payload_json: s3Payload,
            version: "1.0"
        });

        logger.info({ jobId, stage: 'S3' }, 'Final synthesis completed');
    }

    /**
     * Update job status
     */
    private async updateJobStatus(jobId: number, status: string, errorCode?: string) {
        const job = await this.jobRepository.findOne({ where: { id: jobId } });
        if (job) {
            job.status = status;
            if (errorCode) {
                job.error_code = errorCode;
            }
            job.attempts = (job.attempts || 0) + 1;
            await this.jobRepository.save(job);
        }
    }
}

// Export worker function for BullMQ
export async function evaluationProcessor(job: Job) {
    const worker = new EvaluationWorker();
    return await worker.processEvaluation(job);
}
