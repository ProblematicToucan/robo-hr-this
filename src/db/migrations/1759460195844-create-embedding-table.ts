import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmbeddingTable1759460195844 implements MigrationInterface {
    name = 'CreateEmbeddingTable1759460195844'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "embeddings" ("id" SERIAL NOT NULL, "doc_id" integer NOT NULL, "chunk_id" character varying(100) NOT NULL, "vector_ref" character varying(100) NOT NULL, "metadata" jsonb NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_19b6b451e1ef345884caca1f544" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "embeddings" ADD CONSTRAINT "FK_c1c1c23a16e5872c5c2e697e8d4" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "embeddings" DROP CONSTRAINT "FK_c1c1c23a16e5872c5c2e697e8d4"`);
        await queryRunner.query(`DROP TABLE "embeddings"`);
    }

}
