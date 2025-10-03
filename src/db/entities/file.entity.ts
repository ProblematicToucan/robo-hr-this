import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn } from "typeorm";

/**
 * File Entity
 * 
 * Stores metadata for uploaded files (CVs and project reports) that users submit for evaluation.
 * This table tracks file information but NOT the actual file content - files are stored
 * in the filesystem or cloud storage (S3) with the storage_uri pointing to the location.
 * 
 * File Types:
 * - cv: Candidate's resume/CV (PDF)
 * - report: Project case study report (PDF)
 * 
 * File Lifecycle:
 * 1. User uploads file via POST /upload
 * 2. File stored in filesystem/cloud storage
 * 3. File metadata saved to this table
 * 4. File ID returned to user for evaluation request
 * 5. File referenced during LLM evaluation stages
 * 
 * Security:
 * - checksum: Validates file integrity and prevents tampering
 * - storage_uri: Secure path to actual file location
 */
@Entity({ name: "files" })
export class File {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "varchar",
        length: 20
    })
    type: string; // 'cv' or 'report'

    @Column({
        type: "varchar",
        length: 500
    })
    storage_uri: string; // Path to file (local or S3 URL)

    @Column({
        type: "varchar",
        length: 64
    })
    checksum: string; // SHA-256 hash for file integrity

    @CreateDateColumn({ name: "created_at" })
    created_at: Date; // When file was uploaded
}
