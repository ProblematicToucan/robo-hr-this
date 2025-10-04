import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHashOnDocumentTable1759541293316 implements MigrationInterface {
    name = 'AddHashOnDocumentTable1759541293316'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" ADD "content_hash" character varying(64) NOT NULL`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "UQ_2176081aa7c1abf200e1c0d4ab8" UNIQUE ("content_hash")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "UQ_2176081aa7c1abf200e1c0d4ab8"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP COLUMN "content_hash"`);
    }

}
