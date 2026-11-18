-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'DIRECTOR';
ALTER TYPE "Role" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "erp_users" ADD COLUMN     "username" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "access_grants" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "employeeId" TEXT,
ADD COLUMN     "managerId" TEXT;

-- CreateTable
CREATE TABLE "data_import_batches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "asOfDate" DATE,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "issues" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "data_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_facts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "batchId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "column" INTEGER,
    "effectiveDate" DATE,
    "projectId" TEXT,
    "employeeId" TEXT,
    "productId" TEXT,
    "assetId" TEXT,
    "accountId" TEXT,
    "documentNumber" TEXT,
    "quantity" DECIMAL(18,3),
    "debit" DECIMAL(18,2),
    "credit" DECIMAL(18,2),
    "amount" DECIMAL(18,2),
    "status" TEXT NOT NULL DEFAULT 'VALIDATED',
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "data_import_batches_companyId_createdAt_idx" ON "data_import_batches"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "source_facts_sourceKey_key" ON "source_facts"("sourceKey");

-- CreateIndex
CREATE INDEX "source_facts_companyId_kind_effectiveDate_idx" ON "source_facts"("companyId", "kind", "effectiveDate");

-- CreateIndex
CREATE INDEX "source_facts_companyId_employeeId_effectiveDate_idx" ON "source_facts"("companyId", "employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "source_facts_companyId_branchId_kind_idx" ON "source_facts"("companyId", "branchId", "kind");

-- CreateIndex
CREATE INDEX "source_facts_batchId_kind_status_idx" ON "source_facts"("batchId", "kind", "status");

-- CreateIndex
CREATE INDEX "source_facts_companyId_documentNumber_idx" ON "source_facts"("companyId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "erp_users_username_key" ON "erp_users"("username");

-- CreateIndex
CREATE INDEX "access_grants_companyId_managerId_idx" ON "access_grants"("companyId", "managerId");

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_companyId_employeeId_key" ON "access_grants"("companyId", "employeeId");

ALTER TABLE erp_users ADD CONSTRAINT user_login_required CHECK (email IS NOT NULL OR username IS NOT NULL);
ALTER TABLE access_grants ADD CONSTRAINT grant_manager_fk FOREIGN KEY("managerId") REFERENCES erp_users(id);
ALTER TABLE access_grants ADD CONSTRAINT grant_employee_fk FOREIGN KEY("employeeId") REFERENCES master_records(id);
ALTER TABLE data_import_batches ADD CONSTRAINT batch_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_batch_fk FOREIGN KEY("batchId") REFERENCES data_import_batches(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_file_fk FOREIGN KEY("sourceFileId") REFERENCES source_files(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_branch_fk FOREIGN KEY("branchId") REFERENCES branches(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_employee_fk FOREIGN KEY("employeeId") REFERENCES master_records(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_project_fk FOREIGN KEY("projectId") REFERENCES master_records(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_product_fk FOREIGN KEY("productId") REFERENCES master_records(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_asset_fk FOREIGN KEY("assetId") REFERENCES master_records(id);
ALTER TABLE source_facts ADD CONSTRAINT fact_account_fk FOREIGN KEY("accountId") REFERENCES chart_of_accounts(id);
CREATE FUNCTION source_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ref TEXT; expected TEXT; i INT;
BEGIN
 IF TG_TABLE_NAME='access_grants' THEN
  IF NEW."employeeId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records WHERE id=NEW."employeeId" AND "companyId"=NEW."companyId" AND kind='EMPLOYEE') THEN RAISE EXCEPTION 'Employee outside company'; END IF;
  IF NEW."managerId"=NEW."userId" THEN RAISE EXCEPTION 'Self reporting forbidden'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM data_import_batches WHERE id=NEW."batchId" AND "companyId"=NEW."companyId") THEN RAISE EXCEPTION 'Batch outside company'; END IF;
  IF NEW."branchId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM branches WHERE id=NEW."branchId" AND "companyId"=NEW."companyId") THEN RAISE EXCEPTION 'Branch outside company'; END IF;
  FOR i IN 1..4 LOOP
   ref := CASE i WHEN 1 THEN NEW."employeeId" WHEN 2 THEN NEW."projectId" WHEN 3 THEN NEW."productId" ELSE NEW."assetId" END;
   expected := CASE i WHEN 1 THEN 'EMPLOYEE' WHEN 2 THEN 'PROJECT' WHEN 3 THEN 'PRODUCT' ELSE 'ASSET' END;
   IF ref IS NOT NULL AND NOT EXISTS(SELECT 1 FROM master_records WHERE id=ref AND "companyId"=NEW."companyId" AND kind=expected) THEN RAISE EXCEPTION 'Master reference outside company or kind'; END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER source_scope_guard BEFORE INSERT OR UPDATE ON source_facts FOR EACH ROW EXECUTE FUNCTION source_scope_guard();
CREATE TRIGGER grant_employee_guard BEFORE INSERT OR UPDATE ON access_grants FOR EACH ROW EXECUTE FUNCTION source_scope_guard();

