import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { Document } from "./document.entity";

/**
 * Embedding Entity
 * 
 * Stores REFERENCES to vectors in Qdrant, not the actual vectors.
 * The actual vectors are stored in Qdrant for efficient similarity search.
 * This table maintains the mapping between PostgreSQL documents and their
 * corresponding vector chunks in Qdrant for RAG retrieval.
 * 
 * Vector Storage Strategy:
 * - Actual vectors: Stored in Qdrant (high-performance vector DB)
 * - References: Stored in PostgreSQL (relational metadata)
 * - Chunking: Documents split into 512-1024 token chunks with overlap
 * 
 * RAG Retrieval Flow:
 * 1. Query comes in for evaluation stage
 * 2. Generate query embedding using OpenAI
 * 3. Search Qdrant for similar vectors using vector_ref
 * 4. Retrieve document chunks for LLM context
 * 5. Filter by document_type and scope metadata
 * 
 * Metadata Structure:
 * - doc_type: job_description, case_brief, cv_rubric, project_rubric
 * - scope: cv (for S1), project (for S2)
 * - section: introduction, requirements, scoring, etc.
 * - version: document version for consistency
 */
@Entity({ name: "embeddings" })
export class Embedding {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: "doc_id" })
    docId: number;

    @ManyToOne(() => Document, { onDelete: "CASCADE" })
    @JoinColumn({ name: "doc_id" })
    document: Document;

    @Column({
        type: "varchar",
        length: 100
    })
    chunk_id: string; // Unique identifier for this text chunk

    @Column({
        type: "varchar",
        length: 100
    })
    vector_ref: string; // Reference to vector in Qdrant (document_id_chunk_index)

    @Column({
        type: "jsonb"
    })
    metadata: object; // Chunk metadata (section, page, doc_type, scope, etc.)

    @CreateDateColumn({ name: "created_at" })
    created_at: Date; // When this embedding was created
}
