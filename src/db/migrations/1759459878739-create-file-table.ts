import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFileTable1759459878739 implements MigrationInterface {
    name = 'CreateFileTable1759459878739'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "files" ("id" SERIAL NOT NULL, "type" character varying(20) NOT NULL, "storage_uri" character varying(500) NOT NULL, "checksum" character varying(64) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6c16b9093a142e0e7613b04a3d9" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "files"`);
    }

}
