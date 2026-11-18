-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'FINANCE', 'HR', 'SUPERVISOR', 'STAFF', 'AUDITOR');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('IMPORTED', 'DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'REJECTED', 'CANCELLED');

-- DropIndex
DROP INDEX "fiscal_periods_start_date_end_date_key";

-- AlterTable
ALTER TABLE "fiscal_periods" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'DEMO';

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "actor_id" TEXT,
ADD COLUMN     "branch_id" TEXT,
ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'DEMO';

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "company_id" TEXT NOT NULL DEFAULT 'DEMO',
ADD COLUMN     "owner_id" TEXT;

-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "actor_id" TEXT,
ADD COLUMN     "company_id" TEXT;

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "radius" INTEGER NOT NULL DEFAULT 200,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erp_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "isSuperuser" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erp_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_grants" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "branchIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "sourceKey" TEXT,
    "sourceFileId" TEXT,
    "sourceRow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "module" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL DEFAULT '{}',
    "amount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "settled" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "actorId" TEXT NOT NULL,
    "approvedBy" TEXT,
    "journalId" TEXT,
    "sourceKey" TEXT,
    "sourceFileId" TEXT,
    "sourceRow" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_lines" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "total" DECIMAL(15,2) NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "business_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_lots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "expiresAt" DATE,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(15,2) NOT NULL,
    "quarantined" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discussions" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "branchId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'umum',
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discussions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_files" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT 'KBA',
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "modifiedAt" TIMESTAMP(3),
    "sha256" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INDEXED',
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "source_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sourceFileId" TEXT NOT NULL,
    "sheet" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REVIEW',
    "data" JSONB NOT NULL,
    "issue" TEXT NOT NULL,
    "targetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "module_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "branches_companyId_idx" ON "branches"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_companyId_code_key" ON "branches"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "erp_users_email_key" ON "erp_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "access_grants_userId_companyId_key" ON "access_grants"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "master_records_sourceKey_key" ON "master_records"("sourceKey");

-- CreateIndex
CREATE INDEX "master_records_companyId_kind_branchId_idx" ON "master_records"("companyId", "kind", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "master_records_companyId_kind_code_key" ON "master_records"("companyId", "kind", "code");

-- CreateIndex
CREATE UNIQUE INDEX "business_records_number_key" ON "business_records"("number");

-- CreateIndex
CREATE UNIQUE INDEX "business_records_journalId_key" ON "business_records"("journalId");

-- CreateIndex
CREATE UNIQUE INDEX "business_records_sourceKey_key" ON "business_records"("sourceKey");

-- CreateIndex
CREATE INDEX "business_records_companyId_module_status_date_idx" ON "business_records"("companyId", "module", "status", "date");

-- CreateIndex
CREATE INDEX "business_records_companyId_branchId_idx" ON "business_records"("companyId", "branchId");

-- CreateIndex
CREATE INDEX "business_lines_recordId_idx" ON "business_lines"("recordId");

-- CreateIndex
CREATE INDEX "stock_lots_companyId_productId_warehouseId_expiresAt_idx" ON "stock_lots"("companyId", "productId", "warehouseId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_lots_companyId_warehouseId_productId_lotCode_key" ON "stock_lots"("companyId", "warehouseId", "productId", "lotCode");

-- CreateIndex
CREATE INDEX "stock_movements_companyId_recordId_idx" ON "stock_movements"("companyId", "recordId");

-- CreateIndex
CREATE INDEX "discussions_companyId_branchId_createdAt_idx" ON "discussions"("companyId", "branchId", "createdAt");

-- CreateIndex
CREATE INDEX "source_files_companyId_status_idx" ON "source_files"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_fingerprint_key" ON "import_rows"("fingerprint");

-- CreateIndex
CREATE INDEX "import_rows_companyId_kind_status_idx" ON "import_rows"("companyId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "module_settings_companyId_key_key" ON "module_settings"("companyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_company_id_start_date_end_date_key" ON "fiscal_periods"("company_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "access_grants" ADD CONSTRAINT "access_grants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "erp_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_lines" ADD CONSTRAINT "business_lines_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "business_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO companies(id,name,code,"active","isDemo",settings,sequence) VALUES ('DEMO','Kunci Group — Simulasi','DEMO',true,true,'{}',0);
ALTER TABLE fiscal_periods DROP CONSTRAINT no_overlapping_periods;
ALTER TABLE fiscal_periods ADD CONSTRAINT fiscal_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
CREATE FUNCTION period_company_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM companies WHERE id=NEW.company_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM fiscal_periods WHERE company_id=NEW.company_id AND id<>NEW.id AND daterange(start_date,end_date,'[]') && daterange(NEW.start_date,NEW.end_date,'[]')) THEN RAISE EXCEPTION 'Overlapping company fiscal period'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER period_company_guard BEFORE INSERT ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION period_company_guard();
ALTER TABLE branches ADD CONSTRAINT branch_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE branches ADD CONSTRAINT branch_id_company_unique UNIQUE(id,"companyId");
ALTER TABLE master_records ADD CONSTRAINT master_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE master_records ADD CONSTRAINT master_branch_scope FOREIGN KEY("branchId","companyId") REFERENCES branches(id,"companyId");
ALTER TABLE business_records ADD CONSTRAINT business_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE business_records ADD CONSTRAINT business_branch_scope FOREIGN KEY("branchId","companyId") REFERENCES branches(id,"companyId");
ALTER TABLE access_grants ADD CONSTRAINT grant_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE stock_lots ADD CONSTRAINT stock_company_fk FOREIGN KEY("companyId") REFERENCES companies(id);
ALTER TABLE stock_lots ADD CONSTRAINT stock_branch_scope FOREIGN KEY("branchId","companyId") REFERENCES branches(id,"companyId");
ALTER TABLE stock_lots ADD CONSTRAINT nonnegative_stock CHECK(quantity>=0 AND "unitCost">=0);
ALTER TABLE business_records ADD CONSTRAINT nonnegative_amount CHECK(amount>=0 AND settled>=0 AND settled<=amount);
ALTER TABLE business_lines ADD CONSTRAINT valid_business_line CHECK(quantity>0 AND "unitPrice">=0 AND total>=0);
CREATE FUNCTION business_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status='POSTED' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Posted business document cannot be deleted'; END IF;
  IF (to_jsonb(NEW)-'settled'-'version'-'updatedAt')<>(to_jsonb(OLD)-'settled'-'version'-'updatedAt') OR NEW.settled<OLD.settled THEN RAISE EXCEPTION 'Posted business document is immutable'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER business_immutable BEFORE UPDATE OR DELETE ON business_records FOR EACH ROW EXECUTE FUNCTION business_immutable();
CREATE FUNCTION business_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid text;
BEGIN
 IF TG_OP='DELETE' THEN rid=OLD."recordId"; ELSE rid=NEW."recordId"; END IF;
 IF EXISTS(SELECT 1 FROM business_records WHERE id=rid AND status NOT IN ('DRAFT','IMPORTED')) THEN RAISE EXCEPTION 'Document lines are locked'; END IF;
 IF TG_OP='UPDATE' AND OLD."recordId"<>NEW."recordId" THEN RAISE EXCEPTION 'Cannot move business line'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER business_line_guard BEFORE INSERT OR UPDATE OR DELETE ON business_lines FOR EACH ROW EXECUTE FUNCTION business_line_guard();
CREATE TRIGGER stock_movement_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION protect_audit();
