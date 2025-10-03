import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateJobArtifactTable1759459482096 implements MigrationInterface {
    name = 'CreateJobArtifactTable1759459482096'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "job_artifacts" ("id" SERIAL NOT NULL, "job_id" integer NOT NULL, "stage" character varying(10) NOT NULL, "payload_json" jsonb NOT NULL, "version" character varying(20) NOT NULL DEFAULT '1.0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9068cb5eef4aa5559dc3b33a82c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "job_artifacts" ADD CONSTRAINT "FK_3ebc279671277becf665a361266" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "job_artifacts" DROP CONSTRAINT "FK_3ebc279671277becf665a361266"`);
        await queryRunner.query(`DROP TABLE "job_artifacts"`);
    }

}
