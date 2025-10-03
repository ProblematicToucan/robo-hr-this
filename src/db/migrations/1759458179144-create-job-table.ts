import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateJobTable1759458179144 implements MigrationInterface {
    name = 'CreateJobTable1759458179144'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "jobs" ("id" SERIAL NOT NULL, "status" character varying(50) NOT NULL DEFAULT 'queued', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "error_code" character varying, "attempts" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_cf0a6c42b72fcc7f7c237def345" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "jobs"`);
    }

}
