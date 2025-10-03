import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Job } from "./job.entity";

/**
 * JobArtifact Entity
 * 
 * Stores the OUTPUT/RESULTS from each stage of the LLM evaluation pipeline.
 * This is NOT used for RAG - it's the final evaluation results that get returned to users.
 * 
 * Evaluation Pipeline:
 * S1: CV Evaluation → stores cv_match_rate, cv_feedback, technical scores
 * S2: Project Evaluation → stores project_score, project_feedback, code quality scores  
 * S3: Final Synthesis → stores overall_summary
 * 
 * RAG Ground-Truth Documents (job descriptions, rubrics) are stored separately
 * in the Document entity and Qdrant vector database for LLM context.
 */
@Entity({ name: "job_artifacts" })
export class JobArtifact {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: "job_id" })
    jobId: number;

    @ManyToOne(() => Job, { onDelete: "CASCADE" })
    @JoinColumn({ name: "job_id" })
    job: Job;

    @Column({
        type: "varchar",
        length: 10
    })
    stage: string; // S1 (CV), S2 (Project), S3 (Final Synthesis)

    @Column({
        type: "jsonb"
    })
    payload_json: object; // LLM evaluation results as JSON

    @Column({
        type: "varchar",
        length: 20,
        default: "1.0"
    })
    version: string; // Evaluation logic version for reproducibility

    @CreateDateColumn({ name: "created_at" })
    created_at: Date;
}
