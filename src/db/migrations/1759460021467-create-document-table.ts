import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDocumentTable1759460021467 implements MigrationInterface {
    name = 'CreateDocumentTable1759460021467'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "documents" ("id" SERIAL NOT NULL, "type" character varying(50) NOT NULL, "version" character varying(20) NOT NULL DEFAULT '1.0', "storage_uri" character varying(500) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "documents"`);
    }

}
