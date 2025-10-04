import { Job } from 'bullmq';
import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';
import { AppDataSource } from '../db/data-source';
import { Job as JobEntity } from '../db/entities/job.entity';
import { JobArtifact } from '../db/entities/job-artifact.entity';
import { File } from '../db/entities/file.entity';
import { logger, ILogger } from '../config/logger';
import { getOpenAIService, IOpenAIService } from '../services/openai.service';
import { getRAGService } from '../services/rag.service';
import { IDataSource, IRepository } from '../db/interfaces';
import {
    CVEvaluationPayload,
    ProjectEvaluationPayload,
    FinalSynthesisPayload
} from '../types/evaluation';

// Interfaces for better testability
export interface IFileSystem {
    readFileSync(path: string): Buffer;
}

export interface IPDFParser {
    (buffer: Buffer): Promise<{ text: string }>;
}

export interface IRAGService {
    retrieveCVContext(query: string, topK: number): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }>;
    retrieveProjectContext(query: string, topK: number): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }>;
    retrieveFinalContext(query: string, topK: number): Promise<{
        context: string;
        sources: Array<{
            document_type: string;
            chunk_text: string;
            score: number;
        }>;
    }>;
}

export interface IEvaluationWorker {
    processEvaluation(job: Job): Promise<{ success: boolean; jobId: number }>;
}

/**
 * Evaluation Worker with Dependency Injection
 * 
 * Processes evaluation jobs asynchronously.
 * Implements the 3-stage evaluation pipeline:
 * S1: CV Evaluation
 * S2: Project Evaluation  
 * S3: Final Synthesis
 */
export class EvaluationWorker implements IEvaluationWorker {
    constructor(
        private dataSource: IDataSource,
        private openai: IOpenAIService,
        private rag: IRAGService,
        private logger: ILogger,
        private fileSystem: IFileSystem = fs,
        private pdfParser: IPDFParser = pdf
    ) {
        this.jobRepository = dataSource.getRepository(JobEntity);
        this.artifactRepository = dataSource.getRepository(JobArtifact);
        this.fileRepository = dataSource.getRepository(File);
    }

    private jobRepository: IRepository<JobEntity>;
    private artifactRepository: IRepository<JobArtifact>;
    private fileRepository: IRepository<File>;

    /**
     * Factory method for production use
     */
    static create(): EvaluationWorker {
        return new EvaluationWorker(
            AppDataSource as any, // Cast to interface
            getOpenAIService(),
            getRAGService(),
            logger,
            fs,
            pdf
        );
    }

    /**
     * Process evaluation job
     */
    async processEvaluation(job: Job): Promise<{ success: boolean; jobId: number }> {
        const { jobId, jobTitle, cvFileId, reportFileId } = job.data;

        this.logger.info({
            jobId,
            jobTitle,
            cvFileId,
            reportFileId,
            workerJobId: job.id
        }, 'Starting evaluation processing');

        try {
            // Update job status to processing (don't increment attempts)
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

            // Mark job as completed (don't increment attempts)
            await this.updateJobStatus(jobId, 'completed');

            this.logger.info({
                jobId,
                status: 'completed'
            }, 'Evaluation processing completed');

            return { success: true, jobId };

        } catch (error) {
            this.logger.error('Evaluation processing failed', {
                jobId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });

            // Mark job as failed (increment attempts for failed jobs)
            await this.updateJobStatus(jobId, 'failed', 'processing_error', true);

            throw error;
        }
    }

    /**
     * Parse PDF file and extract text
     */
    private async parsePDF(filePath: string): Promise<string> {
        try {
            const pdfBuffer = this.fileSystem.readFileSync(filePath);
            const pdfData = await this.pdfParser(pdfBuffer);
            return pdfData.text;
        } catch (error: any) {
            this.logger.error('Failed to parse PDF:', error);
            throw new Error(`PDF parsing failed: ${error.message}`);
        }
    }

    /**
     * Stage S1: CV Evaluation
     */
    private async processStageS1(jobId: number, cvFile: File, jobTitle: string): Promise<void> {
        this.logger.info({ jobId, stage: 'S1' }, 'Processing CV evaluation');

        try {
            // Parse CV PDF
            const cvText = await this.parsePDF(cvFile.storage_uri);

            // Retrieve relevant context using RAG
            const query = `Evaluate CV for ${jobTitle} position - technical skills, experience level, achievements, and cultural fit`;
            const { context, sources } = await this.rag.retrieveCVContext(query, 6);

            // Prepare LLM prompt for CV evaluation
            const messages = [
                {
                    role: "system",
                    content: `You are an expert CV evaluator. Analyze the candidate's CV against the job requirements and evaluation criteria. Return a JSON response with the following structure:
                    {
                        "parameters": {
                            "technical_skills": number (1-5),
                            "experience_level": number (1-5), 
                            "relevant_achievements": number (1-5),
                            "cultural_fit": number (1-5)
                        },
                        "weighted_average_1_to_5": number,
                        "cv_match_rate": number (0-1),
                        "cv_feedback": string
                    }`
                },
                {
                    role: "user",
                    content: `Job Title: ${jobTitle}

Evaluation Criteria:
${context}

Candidate CV:
${cvText}

Please evaluate this CV against the job requirements. Consider technical skills, experience level, relevant achievements, and cultural fit indicators. Provide specific feedback and scores.`
                }
            ];

            // Generate LLM evaluation
            const llmResponse = await this.openai.generateStructuredCompletion(messages, {});

            // Validate and process response
            const s1Payload: CVEvaluationPayload = {
                parameters: {
                    technical_skills: Math.max(1, Math.min(5, llmResponse.parameters.technical_skills)),
                    experience_level: Math.max(1, Math.min(5, llmResponse.parameters.experience_level)),
                    relevant_achievements: Math.max(1, Math.min(5, llmResponse.parameters.relevant_achievements)),
                    cultural_fit: Math.max(1, Math.min(5, llmResponse.parameters.cultural_fit))
                },
                weighted_average_1_to_5: Math.max(1, Math.min(5, llmResponse.weighted_average_1_to_5)),
                cv_match_rate: Math.max(0, Math.min(1, llmResponse.cv_match_rate)),
                cv_feedback: llmResponse.cv_feedback
            };

            // Save evaluation result
            await this.artifactRepository.save({
                jobId,
                stage: 'S1',
                payload_json: s1Payload,
                version: "1.0"
            });

            this.logger.info({
                jobId,
                stage: 'S1',
                cvMatchRate: s1Payload.cv_match_rate,
                sourcesCount: sources.length
            }, 'CV evaluation completed');

        } catch (error: any) {
            this.logger.error('CV evaluation failed', { jobId, stage: 'S1', error: error.message });
            // No fallback - let error bubble up to trigger job retry
            throw error;
        }
    }

    /**
     * Stage S2: Project Evaluation
     */
    private async processStageS2(jobId: number, reportFile: File, jobTitle: string): Promise<void> {
        this.logger.info({ jobId, stage: 'S2' }, 'Processing project evaluation');

        try {
            // Parse project report PDF
            const projectText = await this.parsePDF(reportFile.storage_uri);

            // Retrieve relevant context using RAG
            const query = `Evaluate project report for ${jobTitle} position - correctness, code quality, resilience, documentation, and creativity`;
            const { context, sources } = await this.rag.retrieveProjectContext(query, 6);

            // Prepare LLM prompt for project evaluation
            const messages = [
                {
                    role: "system",
                    content: `You are an expert technical project evaluator. Analyze the candidate's project report against the evaluation criteria. Return a JSON response with the following structure:
                    {
                        "parameters": {
                            "correctness": number (1-5),
                            "code_quality": number (1-5),
                            "resilience": number (1-5),
                            "documentation": number (1-5),
                            "creativity": number (1-5)
                        },
                        "project_score": number (1-5),
                        "project_feedback": string
                    }`
                },
                {
                    role: "user",
                    content: `Job Title: ${jobTitle}

Evaluation Criteria:
${context}

Project Report:
${projectText}

Please evaluate this project report. Consider correctness of implementation, code quality, resilience/error handling, documentation quality, and creativity/innovation. Provide specific feedback and scores.`
                }
            ];

            // Generate LLM evaluation
            const llmResponse = await this.openai.generateStructuredCompletion(messages, {});

            // Validate and process response
            const s2Payload: ProjectEvaluationPayload = {
                parameters: {
                    correctness: Math.max(1, Math.min(5, llmResponse.parameters.correctness)),
                    code_quality: Math.max(1, Math.min(5, llmResponse.parameters.code_quality)),
                    resilience: Math.max(1, Math.min(5, llmResponse.parameters.resilience)),
                    documentation: Math.max(1, Math.min(5, llmResponse.parameters.documentation)),
                    creativity: Math.max(1, Math.min(5, llmResponse.parameters.creativity))
                },
                project_score: Math.max(1, Math.min(5, llmResponse.project_score)),
                project_feedback: llmResponse.project_feedback
            };

            // Save evaluation result
            await this.artifactRepository.save({
                jobId,
                stage: 'S2',
                payload_json: s2Payload,
                version: "1.0"
            });

            this.logger.info({
                jobId,
                stage: 'S2',
                projectScore: s2Payload.project_score,
                sourcesCount: sources.length
            }, 'Project evaluation completed');

        } catch (error: any) {
            this.logger.error('Project evaluation failed', { jobId, stage: 'S2', error: error.message });
            // No fallback - let error bubble up to trigger job retry
            throw error;
        }
    }

    /**
     * Stage S3: Final Synthesis
     */
    private async processStageS3(jobId: number): Promise<void> {
        this.logger.info({ jobId, stage: 'S3' }, 'Processing final synthesis');

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

        try {
            // Get previous stage results
            const s1Data = s1Artifact.payload_json as CVEvaluationPayload;
            const s2Data = s2Artifact.payload_json as ProjectEvaluationPayload;

            // Retrieve additional context for final synthesis
            const query = `Final candidate assessment and hiring recommendation`;
            const { context, sources } = await this.rag.retrieveFinalContext(query, 4);

            // Prepare LLM prompt for final synthesis
            const messages = [
                {
                    role: "system",
                    content: `You are a senior hiring manager. Synthesize the CV and project evaluations into a final candidate assessment. Return a JSON response with the following structure:
                    {
                        "overall_summary": string (3-5 sentences with hiring recommendation)
                    }`
                },
                {
                    role: "user",
                    content: `Job Context:
${context}

CV Evaluation Results:
- Technical Skills: ${s1Data.parameters.technical_skills}/5
- Experience Level: ${s1Data.parameters.experience_level}/5
- Relevant Achievements: ${s1Data.parameters.relevant_achievements}/5
- Cultural Fit: ${s1Data.parameters.cultural_fit}/5
- CV Match Rate: ${(s1Data.cv_match_rate * 100).toFixed(1)}%
- CV Feedback: ${s1Data.cv_feedback}

Project Evaluation Results:
- Correctness: ${s2Data.parameters.correctness}/5
- Code Quality: ${s2Data.parameters.code_quality}/5
- Resilience: ${s2Data.parameters.resilience}/5
- Documentation: ${s2Data.parameters.documentation}/5
- Creativity: ${s2Data.parameters.creativity}/5
- Project Score: ${s2Data.project_score}/5
- Project Feedback: ${s2Data.project_feedback}

Please provide a comprehensive final assessment and hiring recommendation based on both evaluations.`
                }
            ];

            // Generate LLM synthesis
            const llmResponse = await this.openai.generateStructuredCompletion(messages, {});

            // Process response
            const s3Payload: FinalSynthesisPayload = {
                overall_summary: llmResponse.overall_summary
            };

            // Save synthesis result
            await this.artifactRepository.save({
                jobId,
                stage: 'S3',
                payload_json: s3Payload,
                version: "1.0"
            });

            this.logger.info({
                jobId,
                stage: 'S3',
                sourcesCount: sources.length
            }, 'Final synthesis completed');

        } catch (error: any) {
            this.logger.error('Final synthesis failed', { jobId, stage: 'S3', error: error.message });
            // No fallback - let error bubble up to trigger job retry
            throw error;
        }
    }

    /**
     * Update job status
     */
    private async updateJobStatus(jobId: number, status: string, errorCode?: string, incrementAttempts: boolean = false): Promise<void> {
        const job = await this.jobRepository.findOne({ where: { id: jobId } });
        if (job) {
            job.status = status;
            if (errorCode) {
                job.error_code = errorCode;
            }
            // Only increment attempts for failed jobs or when explicitly requested
            if (incrementAttempts) {
                job.attempts = (job.attempts || 0) + 1;
            }
            await this.jobRepository.save(job);
        }
    }
}

// Export worker function for BullMQ
export async function evaluationProcessor(job: Job) {
    const worker = EvaluationWorker.create();
    return await worker.processEvaluation(job);
}
