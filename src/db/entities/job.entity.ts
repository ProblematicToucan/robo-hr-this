import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Job Entity
 * 
 * Central orchestrator table that tracks each evaluation request from start to finish.
 * This is the main table that coordinates the entire CV + Project evaluation pipeline.
 * 
 * Job Lifecycle:
 * 1. User uploads CV + Report → Job created with status: "queued"
 * 2. Worker picks up job → status: "processing" 
 * 3. LLM evaluation stages (S1, S2, S3) → status: "processing"
 * 4. All stages complete → status: "completed"
 * 5. If any stage fails → status: "failed" with error_code
 * 
 * Related Tables:
 * - JobArtifact: Stores results from each evaluation stage (S1, S2, S3)
 * - Files: References to uploaded CV and project report files
 * 
 * Retry Logic:
 * - attempts: Tracks how many times we've tried to process this job
 * - error_code: Specific error type for debugging failed jobs
 * - Exponential backoff: Prevents infinite retry loops
 */
@Entity({ name: "jobs" })
export class Job {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "varchar",
        length: 50,
        default: "queued"
    })
    status: string; // queued → processing → completed/failed

    @CreateDateColumn()
    created_at: Date; // When evaluation was requested

    @UpdateDateColumn()
    updated_at: Date; // Last status change

    @Column({
        type: "varchar",
        nullable: true
    })
    error_code: string; // llm_timeout, parsing_error, etc.

    @Column({
        type: "int",
        default: 0
    })
    attempts: number; // Retry counter for failed jobs
}