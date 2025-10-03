import { config } from "dotenv";
import { DataSource } from "typeorm";

config();

export const dataSource = new DataSource({
    type: "postgres",
    url: process.env.DATABASE_URL,
    synchronize: false,
    entities: ['src/db/entities/*.entity.ts'],
    migrations: ['src/db/migrations/*.ts'],
});
