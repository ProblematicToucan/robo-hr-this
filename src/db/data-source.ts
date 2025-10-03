import { config } from "dotenv";
import { DataSource } from "typeorm";
import { Job } from "./entities/job.entity";

config();

export const dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: false,
    entities: ['src/db/entities/*.entity.ts'],
    migrations: ['src/db/migrations/*.ts'],
});
