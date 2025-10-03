import { Queue, Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../config/logger';

/**
 * Queue Configuration
 * 
 * BullMQ setup for async evaluation processing.
 * Handles job queuing, processing, and monitoring.
 */
export class QueueConfig {
    private redis: Redis;
    private evaluationQueue: Queue;
    private evaluationWorker: Worker;
    private queueEvents: QueueEvents;

    constructor() {
        // Redis connection
        this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
        });

        // Evaluation queue
        this.evaluationQueue = new Queue('evaluation', {
            connection: this.redis,
            defaultJobOptions: {
                removeOnComplete: 10,
                removeOnFail: 5,
                attempts: parseInt(process.env.EVAL_MAX_ATTEMPTS || '5'),
                backoff: {
                    type: 'exponential',
                    delay: parseInt(process.env.EVAL_BACKOFF_MS || '1000'),
                },
            },
        });

        // Queue events for monitoring
        this.queueEvents = new QueueEvents('evaluation', {
            connection: this.redis,
        });

        this.setupEventListeners();
    }

    /**
     * Get the evaluation queue instance
     */
    getEvaluationQueue(): Queue {
        return this.evaluationQueue;
    }

    /**
     * Get the evaluation worker instance
     */
    getEvaluationWorker(): Worker {
        return this.evaluationWorker;
    }

    /**
     * Start the evaluation worker
     */
    startWorker(processor: (job: any) => Promise<any>) {
        this.evaluationWorker = new Worker('evaluation', processor, {
            connection: this.redis,
            concurrency: 1, // Process one job at a time
        });

        this.evaluationWorker.on('completed', (job) => {
            logger.info({
                jobId: job.id,
                jobName: job.name,
                duration: job.processedOn! - job.timestamp
            }, 'Evaluation job completed');
        });

        this.evaluationWorker.on('failed', (job, err) => {
            logger.error({
                jobId: job?.id,
                jobName: job?.name,
                error: err.message,
                attempts: job?.attemptsMade
            }, 'Evaluation job failed');
        });

        this.evaluationWorker.on('stalled', (jobId) => {
            logger.warn({ jobId }, 'Evaluation job stalled');
        });
    }

    /**
     * Setup queue event listeners
     */
    private setupEventListeners() {
        this.queueEvents.on('waiting', ({ jobId }) => {
            logger.info({ jobId }, 'Job waiting in queue');
        });

        this.queueEvents.on('active', ({ jobId }) => {
            logger.info({ jobId }, 'Job started processing');
        });

        this.queueEvents.on('completed', ({ jobId, returnvalue }) => {
            logger.info({ jobId, returnvalue }, 'Job completed successfully');
        });

        this.queueEvents.on('failed', ({ jobId, failedReason }) => {
            logger.error({ jobId, failedReason }, 'Job failed');
        });
    }

    /**
     * Close all connections
     */
    async close() {
        await this.evaluationWorker?.close();
        await this.evaluationQueue.close();
        await this.queueEvents.close();
        await this.redis.quit();
    }
}

// Singleton instance
let queueConfig: QueueConfig | null = null;

export function getQueueConfig(): QueueConfig {
    if (!queueConfig) {
        queueConfig = new QueueConfig();
    }
    return queueConfig;
}
