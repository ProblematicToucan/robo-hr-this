import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * Document Entity
 * 
 * Stores GROUND-TRUTH documents used for RAG retrieval during LLM evaluation.
 * These are the source documents that get chunked, embedded, and stored in Qdrant
 * for providing context to the LLM during evaluation stages.
 * 
 * Document Types (from objective):
 * - job_description: Job posting requirements and criteria
 * - case_brief: Case study instructions and expectations
 * - cv_rubric: CV scoring criteria and evaluation standards
 * - project_rubric: Project evaluation criteria and scoring guidelines
 * 
 * Document Lifecycle:
 * 1. Admin uploads ground-truth PDFs to ./src/ground directory
 * 2. Use API endpoints to process documents:
 *    - POST /ingest/document (single document)
 *    - POST /ingest/directory (batch processing)
 * 3. Documents chunked, embedded, and stored in Qdrant
 * 4. Document metadata saved to this table
 * 5. Used during RAG retrieval for LLM context
 * 
 * RAG Usage:
 * - S1 (CV Evaluation): Retrieves job_description + cv_rubric
 * - S2 (Project Evaluation): Retrieves case_brief + project_rubric
 * - S3 (Final Synthesis): May reference any document for context
 */
@Entity({ name: "documents" })
export class Document {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "varchar",
        length: 50
    })
    type: string; // job_description, case_brief, cv_rubric, project_rubric

    @Column({
        type: "varchar",
        length: 20,
        default: "1.0"
    })
    version: string; // Document version for tracking changes

    @Column({
        type: "varchar",
        length: 500
    })
    storage_uri: string; // Path to PDF file (local or S3)

    @Column({
        type: "varchar",
        length: 64,
        unique: true
    })
    content_hash: string; // SHA256 hash of file content for deduplication

    @CreateDateColumn({ name: "created_at" })
    created_at: Date; // When document was added

    @UpdateDateColumn({ name: "updated_at" })
    updated_at: Date; // When document was last updated
}
