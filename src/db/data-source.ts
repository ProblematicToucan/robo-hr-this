import { config } from "dotenv";
import { DataSource } from "typeorm";
import { Job } from "./entities/job.entity";
import { JobArtifact } from "./entities/job-artifact.entity";
import { File } from "./entities/file.entity";
import { Document } from "./entities/document.entity";
import { Embedding } from "./entities/embedding.entity";

config();

export const AppDataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
    entities: [Job, JobArtifact, File, Document, Embedding],
    migrations: ['src/db/migrations/*.ts'],
});
