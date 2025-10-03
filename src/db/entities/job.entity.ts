import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity({ name: "jobs" })
export class Job {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: "varchar",
        length: 50,
        default: "queued"
    })
    status: string; // queued, processing, completed, failed

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;

    @Column({
        type: "varchar",
        nullable: true
    })
    error_code: string;

    @Column({
        type: "int",
        default: 0
    })
    attempts: number;
}