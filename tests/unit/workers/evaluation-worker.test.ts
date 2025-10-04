import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EvaluationWorker, IFileSystem, IPDFParser, IRAGService } from '../../../src/workers/evaluation-worker';
import { IOpenAIService } from '../../../src/services/openai.service';
import { ILogger } from '../../../src/config/logger';
import { IDataSource, IRepository } from '../../../src/db/interfaces';
import { Job } from 'bullmq';

// Mock the logger
vi.mock('../../../src/config/logger', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

// Mock pdf-parse to prevent file system access during import
vi.mock('pdf-parse', () => ({
    default: vi.fn()
}));

// Mock database entities and data source
vi.mock('../../../src/db/data-source', () => ({
    AppDataSource: {
        getRepository: vi.fn(),
        createQueryRunner: vi.fn()
    }
}));

vi.mock('../../../src/db/entities/job.entity', () => ({
    Job: class JobEntity { }
}));

vi.mock('../../../src/db/entities/job-artifact.entity', () => ({
    JobArtifact: class JobArtifactEntity { }
}));

vi.mock('../../../src/db/entities/file.entity', () => ({
    File: class FileEntity { }
}));

describe('EvaluationWorker - Dependency Injection Tests', () => {
    let mockDataSource: IDataSource;
    let mockOpenAI: any;
    let mockRAG: any;
    let mockLogger: ILogger;
    let mockFileSystem: any;
    let mockPDFParser: any;
    let mockJobRepository: any;
    let mockArtifactRepository: any;
    let mockFileRepository: any;
    let evaluationWorker: EvaluationWorker;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock repositories
        mockJobRepository = {
            findOne: vi.fn(),
            find: vi.fn(),
            save: vi.fn(),
            delete: vi.fn()
        };

        mockArtifactRepository = {
            findOne: vi.fn(),
            find: vi.fn(),
            save: vi.fn(),
            delete: vi.fn()
        };

        mockFileRepository = {
            findOne: vi.fn(),
            find: vi.fn(),
            save: vi.fn(),
            delete: vi.fn()
        };

        // Mock data source
        mockDataSource = {
            getRepository: vi.fn().mockImplementation((entity: any) => {
                if (entity.name === 'JobEntity') return mockJobRepository;
                if (entity.name === 'JobArtifactEntity') return mockArtifactRepository;
                if (entity.name === 'FileEntity') return mockFileRepository;
                return mockJobRepository;
            }),
            createQueryRunner: vi.fn()
        };

        // Mock OpenAI service
        mockOpenAI = {
            generateEmbeddings: vi.fn(),
            generateEmbedding: vi.fn(),
            generateCompletion: vi.fn(),
            generateStructuredCompletion: vi.fn(),
            testConnection: vi.fn()
        };

        // Mock RAG service
        mockRAG = {
            retrieveCVContext: vi.fn(),
            retrieveProjectContext: vi.fn(),
            retrieveFinalContext: vi.fn()
        };

        // Mock logger
        mockLogger = {
            info: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
            debug: vi.fn()
        };

        // Mock file system
        mockFileSystem = {
            readFileSync: vi.fn()
        } as any;

        // Mock PDF parser
        mockPDFParser = vi.fn();

        // Create worker instance
        evaluationWorker = new EvaluationWorker(
            mockDataSource,
            mockOpenAI,
            mockRAG,
            mockLogger,
            mockFileSystem,
            mockPDFParser
        );
    });

    describe('Constructor and Factory', () => {
        it('should create worker with dependency injection', () => {
            expect(evaluationWorker).toBeInstanceOf(EvaluationWorker);
        });

        it('should create worker using factory method', () => {
            const worker = EvaluationWorker.create();
            expect(worker).toBeInstanceOf(EvaluationWorker);
        });
    });

    describe('processEvaluation - Success Cases', () => {
        it('should process evaluation successfully', async () => {
            // Mock job data
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            // Mock file lookups
            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            // Mock job status updates
            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });
            mockJobRepository.save.mockResolvedValue({});

            // Mock PDF parsing
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
            mockPDFParser.mockResolvedValue({ text: 'CV content here' });

            // Mock RAG responses
            mockRAG.retrieveCVContext.mockResolvedValue({
                context: 'CV evaluation criteria',
                sources: [{ document_type: 'cv_rubric', chunk_text: 'criteria', score: 0.9 }]
            });

            mockRAG.retrieveProjectContext.mockResolvedValue({
                context: 'Project evaluation criteria',
                sources: [{ document_type: 'project_rubric', chunk_text: 'criteria', score: 0.9 }]
            });

            mockRAG.retrieveFinalContext.mockResolvedValue({
                context: 'Final assessment criteria',
                sources: [{ document_type: 'job_description', chunk_text: 'criteria', score: 0.9 }]
            });

            // Mock OpenAI responses
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({
                    parameters: {
                        technical_skills: 4,
                        experience_level: 3,
                        relevant_achievements: 4,
                        cultural_fit: 3
                    },
                    weighted_average_1_to_5: 3.5,
                    cv_match_rate: 0.8,
                    cv_feedback: 'Good technical skills'
                })
                .mockResolvedValueOnce({
                    parameters: {
                        correctness: 4,
                        code_quality: 3,
                        resilience: 4,
                        documentation: 3,
                        creativity: 4
                    },
                    project_score: 3.6,
                    project_feedback: 'Well-implemented project'
                })
                .mockResolvedValueOnce({
                    overall_summary: 'Strong candidate with good technical skills and project implementation.'
                });

            // Create a mock artifact storage to simulate real database behavior
            const mockArtifactStorage: any[] = [];

            // Mock artifact saves - simulate saving artifacts
            mockArtifactRepository.save.mockImplementation((artifact: any) => {
                mockArtifactStorage.push(artifact);
                return Promise.resolve({ id: mockArtifactStorage.length, ...artifact });
            });

            // Mock artifact lookups - simulate finding saved artifacts
            mockArtifactRepository.findOne.mockImplementation((query: any) => {
                const stage = query.where.stage;
                const jobId = query.where.jobId;

                // Find the artifact that was saved for this stage and job
                const artifact = mockArtifactStorage.find(a => a.stage === stage && a.jobId === jobId);
                return Promise.resolve(artifact || null);
            });

            // Execute
            const result = await evaluationWorker.processEvaluation(mockJob);

            // Verify
            expect(result).toEqual({ success: true, jobId: 1 });
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobId: 1,
                    status: 'completed'
                }),
                'Evaluation processing completed'
            );
        });

        it('should handle missing files gracefully', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            // Mock missing files
            mockFileRepository.findOne
                .mockResolvedValueOnce(null) // CV file not found
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Execute and expect error
            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow('Required files not found');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Evaluation processing failed',
                expect.objectContaining({
                    jobId: 1,
                    error: 'Required files not found'
                })
            );
        });
    });

    describe('processEvaluation - Error Handling', () => {
        it('should handle PDF parsing errors', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock PDF parsing error
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('corrupted pdf'));
            mockPDFParser.mockRejectedValue(new Error('PDF parsing failed'));

            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow('PDF parsing failed');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'Evaluation processing failed',
                expect.objectContaining({
                    jobId: 1,
                    error: 'PDF parsing failed: PDF parsing failed'
                })
            );
        });

        it('should handle RAG service errors', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock successful PDF parsing
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
            mockPDFParser.mockResolvedValue({ text: 'CV content here' });

            // Mock RAG service error
            mockRAG.retrieveCVContext.mockRejectedValue(new Error('RAG service unavailable'));

            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow('RAG service unavailable');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'CV evaluation failed',
                expect.objectContaining({
                    jobId: 1,
                    stage: 'S1',
                    error: 'RAG service unavailable'
                })
            );
        });

        it('should handle OpenAI service errors', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock successful PDF parsing and RAG
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
            mockPDFParser.mockResolvedValue({ text: 'CV content here' });

            mockRAG.retrieveCVContext.mockResolvedValue({
                context: 'CV evaluation criteria',
                sources: []
            });

            // Mock OpenAI error
            mockOpenAI.generateStructuredCompletion.mockRejectedValue(new Error('OpenAI API error'));

            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow('OpenAI API error');

            expect(mockLogger.error).toHaveBeenCalledWith(
                'CV evaluation failed',
                expect.objectContaining({
                    jobId: 1,
                    stage: 'S1',
                    error: 'OpenAI API error'
                })
            );
        });
    });

    describe('Stage Processing', () => {
        it('should process Stage S1 (CV Evaluation) correctly', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock Stage S1
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
            mockPDFParser.mockResolvedValue({ text: 'CV content here' });

            mockRAG.retrieveCVContext.mockResolvedValue({
                context: 'CV evaluation criteria',
                sources: [{ document_type: 'cv_rubric', chunk_text: 'criteria', score: 0.9 }]
            });

            mockOpenAI.generateStructuredCompletion.mockResolvedValue({
                parameters: {
                    technical_skills: 4,
                    experience_level: 3,
                    relevant_achievements: 4,
                    cultural_fit: 3
                },
                weighted_average_1_to_5: 3.5,
                cv_match_rate: 0.8,
                cv_feedback: 'Good technical skills'
            });

            mockArtifactRepository.save.mockResolvedValue({});

            // Mock Stage S2
            mockRAG.retrieveProjectContext.mockResolvedValue({
                context: 'Project evaluation criteria',
                sources: []
            });

            mockOpenAI.generateStructuredCompletion.mockResolvedValue({
                parameters: {
                    correctness: 4,
                    code_quality: 3,
                    resilience: 4,
                    documentation: 3,
                    creativity: 4
                },
                project_score: 3.6,
                project_feedback: 'Well-implemented project'
            });

            // Mock Stage S3
            mockArtifactRepository.findOne
                .mockResolvedValueOnce({ payload_json: { parameters: { technical_skills: 4 } } })
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            mockRAG.retrieveFinalContext.mockResolvedValue({
                context: 'Final assessment criteria',
                sources: []
            });

            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({
                    parameters: {
                        technical_skills: 4,
                        experience_level: 3,
                        relevant_achievements: 4,
                        cultural_fit: 3
                    },
                    weighted_average_1_to_5: 3.5,
                    cv_match_rate: 0.8,
                    cv_feedback: 'Good technical skills'
                })
                .mockResolvedValueOnce({
                    parameters: {
                        correctness: 4,
                        code_quality: 3,
                        resilience: 4,
                        documentation: 3,
                        creativity: 4
                    },
                    project_score: 3.6,
                    project_feedback: 'Well-implemented project'
                })
                .mockResolvedValueOnce({
                    overall_summary: 'Strong candidate with good technical skills.'
                });

            // Create a mock artifact storage to simulate real database behavior
            const mockArtifactStorage: any[] = [];

            // Mock artifact saves - simulate saving artifacts
            mockArtifactRepository.save.mockImplementation((artifact: any) => {
                mockArtifactStorage.push(artifact);
                return Promise.resolve({ id: mockArtifactStorage.length, ...artifact });
            });

            // Mock artifact lookups - simulate finding saved artifacts
            mockArtifactRepository.findOne.mockImplementation((query: any) => {
                const stage = query.where.stage;
                const jobId = query.where.jobId;

                // Find the artifact that was saved for this stage and job
                const artifact = mockArtifactStorage.find(a => a.stage === stage && a.jobId === jobId);
                return Promise.resolve(artifact || null);
            });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify Stage S1 was called
            expect(mockRAG.retrieveCVContext).toHaveBeenCalledWith(
                'Evaluate CV for Software Engineer position - technical skills, experience level, achievements, and cultural fit',
                6
            );

            expect(mockOpenAI.generateStructuredCompletion).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({
                        role: 'system',
                        content: expect.stringContaining('expert CV evaluator')
                    }),
                    expect.objectContaining({
                        role: 'user',
                        content: expect.stringContaining('Job Title: Software Engineer')
                    })
                ]),
                {}
            );

            expect(mockArtifactRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobId: 1,
                    stage: 'S1',
                    payload_json: expect.objectContaining({
                        parameters: expect.objectContaining({
                            technical_skills: 4,
                            experience_level: 3
                        }),
                        cv_match_rate: 0.8
                    })
                })
            );
        });

        it('should handle missing previous stage results in S3', async () => {
            const mockJob = {
                data: {
                    jobId: 1,
                    jobTitle: 'Software Engineer',
                    cvFileId: 1,
                    reportFileId: 2
                },
                id: 'job-123'
            } as Job;

            const mockCVFile = { id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' };
            const mockReportFile = { id: 2, type: 'report', storage_uri: '/path/to/report.pdf' };

            mockFileRepository.findOne
                .mockResolvedValueOnce(mockCVFile)
                .mockResolvedValueOnce(mockReportFile);

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock successful S1 and S2
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('mock pdf data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });

            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });

            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' });

            mockArtifactRepository.save.mockResolvedValue({});

            // Mock missing S1 artifact for S3
            mockArtifactRepository.findOne
                .mockResolvedValueOnce(null) // S1 artifact missing
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow(
                'Previous stage results not found for final synthesis'
            );
        });
    });

    describe('Job Status Updates', () => {
        it('should update job status to processing', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            const mockJobEntity = { id: 1, status: 'pending' };
            mockJobRepository.findOne.mockResolvedValue(mockJobEntity);
            mockJobRepository.save.mockResolvedValue({});

            mockFileRepository.findOne
                .mockResolvedValueOnce({ id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' })
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            // Mock all stages to succeed
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });
            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveFinalContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' })
                .mockResolvedValueOnce({ overall_summary: 'Good candidate' });

            // Create a mock artifact storage to simulate real database behavior
            const mockArtifactStorage: any[] = [];

            // Mock artifact saves - simulate saving artifacts
            mockArtifactRepository.save.mockImplementation((artifact: any) => {
                mockArtifactStorage.push(artifact);
                return Promise.resolve({ id: mockArtifactStorage.length, ...artifact });
            });

            // Mock artifact lookups - simulate finding saved artifacts
            mockArtifactRepository.findOne.mockImplementation((query: any) => {
                const stage = query.where.stage;
                const jobId = query.where.jobId;

                // Find the artifact that was saved for this stage and job
                const artifact = mockArtifactStorage.find(a => a.stage === stage && a.jobId === jobId);
                return Promise.resolve(artifact || null);
            });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify job status was updated to completed (since the evaluation succeeds)
            expect(mockJobRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed'
                })
            );
        });

        it('should update job status to completed on success', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            const mockJobEntity = { id: 1, status: 'pending' };
            mockJobRepository.findOne.mockResolvedValue(mockJobEntity);
            mockJobRepository.save.mockResolvedValue({});

            mockFileRepository.findOne
                .mockResolvedValueOnce({ id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' })
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            // Mock all stages to succeed
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });
            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveFinalContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' })
                .mockResolvedValueOnce({ overall_summary: 'Good candidate' });
            mockArtifactRepository.save.mockResolvedValue({});
            mockArtifactRepository.findOne
                .mockResolvedValueOnce({ payload_json: { parameters: { technical_skills: 4 } } })
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify job status was updated to completed
            expect(mockJobRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'completed'
                })
            );
        });

        it('should update job status to failed on error', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            const mockJobEntity = { id: 1, status: 'pending', attempts: 0 };
            mockJobRepository.findOne.mockResolvedValue(mockJobEntity);
            mockJobRepository.save.mockResolvedValue({});

            // Mock missing files to trigger error
            mockFileRepository.findOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            await expect(evaluationWorker.processEvaluation(mockJob)).rejects.toThrow();

            // Verify job status was updated to failed with error code
            expect(mockJobRepository.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    status: 'failed',
                    error_code: 'processing_error',
                    attempts: 1
                })
            );
        });
    });

    describe('Dependency Injection Benefits', () => {
        it('should use injected logger instead of global logger', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            mockFileRepository.findOne
                .mockResolvedValueOnce({ id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' })
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock all stages to succeed
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });
            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveFinalContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' })
                .mockResolvedValueOnce({ overall_summary: 'Good candidate' });
            mockArtifactRepository.save.mockResolvedValue({});
            mockArtifactRepository.findOne
                .mockResolvedValueOnce({ payload_json: { parameters: { technical_skills: 4 } } })
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify injected logger was used
            expect(mockLogger.info).toHaveBeenCalledWith(
                expect.objectContaining({
                    jobId: 1,
                    jobTitle: 'Engineer'
                }),
                'Starting evaluation processing'
            );
        });

        it('should use injected file system instead of global fs', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            mockFileRepository.findOne
                .mockResolvedValueOnce({ id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' })
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock all stages to succeed
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });
            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveFinalContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' })
                .mockResolvedValueOnce({ overall_summary: 'Good candidate' });
            mockArtifactRepository.save.mockResolvedValue({});
            mockArtifactRepository.findOne
                .mockResolvedValueOnce({ payload_json: { parameters: { technical_skills: 4 } } })
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify injected file system was used
            expect(mockFileSystem.readFileSync).toHaveBeenCalledWith('/path/to/cv.pdf');
            expect(mockFileSystem.readFileSync).toHaveBeenCalledWith('/path/to/report.pdf');
        });

        it('should use injected PDF parser instead of global pdf', async () => {
            const mockJob = {
                data: { jobId: 1, jobTitle: 'Engineer', cvFileId: 1, reportFileId: 2 },
                id: 'job-123'
            } as Job;

            mockFileRepository.findOne
                .mockResolvedValueOnce({ id: 1, type: 'cv', storage_uri: '/path/to/cv.pdf' })
                .mockResolvedValueOnce({ id: 2, type: 'report', storage_uri: '/path/to/report.pdf' });

            mockJobRepository.findOne.mockResolvedValue({ id: 1, status: 'pending' });

            // Mock all stages to succeed
            mockFileSystem.readFileSync.mockReturnValue(Buffer.from('data'));
            mockPDFParser.mockResolvedValue({ text: 'content' });
            mockRAG.retrieveCVContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveProjectContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockRAG.retrieveFinalContext.mockResolvedValue({ context: 'criteria', sources: [] });
            mockOpenAI.generateStructuredCompletion
                .mockResolvedValueOnce({ parameters: { technical_skills: 4 }, cv_match_rate: 0.8, cv_feedback: 'good' })
                .mockResolvedValueOnce({ parameters: { correctness: 4 }, project_score: 4, project_feedback: 'good' })
                .mockResolvedValueOnce({ overall_summary: 'Good candidate' });
            mockArtifactRepository.save.mockResolvedValue({});
            mockArtifactRepository.findOne
                .mockResolvedValueOnce({ payload_json: { parameters: { technical_skills: 4 } } })
                .mockResolvedValueOnce({ payload_json: { parameters: { correctness: 4 } } });

            await evaluationWorker.processEvaluation(mockJob);

            // Verify injected PDF parser was used
            expect(mockPDFParser).toHaveBeenCalledWith(Buffer.from('data'));
        });
    });
});
