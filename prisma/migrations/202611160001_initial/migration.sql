-- CreateEnum
CREATE TYPE "Category" AS ENUM ('ASET', 'KEWAJIBAN', 'EKUITAS', 'PENDAPATAN', 'BEBAN');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('DEBIT', 'KREDIT');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('DRAFT', 'POSTED');

-- CreateEnum
CREATE TYPE "EntryType" AS ENUM ('OPENING', 'GENERAL', 'ADJUSTING', 'CLOSING', 'REVERSING');

-- CreateEnum
CREATE TYPE "CashActivity" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'OPEN',
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "normal_balance" "Side" NOT NULL,
    "is_system_account" BOOLEAN NOT NULL DEFAULT false,
    "role" TEXT,
    "is_cash" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "journal_number" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "type" "EntryType" NOT NULL,
    "description" TEXT NOT NULL,
    "attachment_id" TEXT,
    "fiscal_period_id" TEXT NOT NULL,
    "status" "EntryStatus" NOT NULL DEFAULT 'DRAFT',
    "cash_activity" "CashActivity",
    "reversal_of_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journal_entry_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "debit" DECIMAL(15,2) NOT NULL,
    "credit" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_periods_start_date_end_date_key" ON "fiscal_periods"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_role_key" ON "chart_of_accounts"("role");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_journal_number_key" ON "journal_entries"("journal_number");

-- CreateIndex
CREATE UNIQUE INDEX "journal_entries_reversal_of_id_key" ON "journal_entries"("reversal_of_id");

-- CreateIndex
CREATE INDEX "journal_entries_fiscal_period_id_transaction_date_idx" ON "journal_entries"("fiscal_period_id", "transaction_date");

-- CreateIndex
CREATE INDEX "journal_lines_account_id_journal_entry_id_idx" ON "journal_lines"("account_id", "journal_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_path_key" ON "attachments"("path");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fiscal_period_id_fkey" FOREIGN KEY ("fiscal_period_id") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Defense in depth for direct database writes.
ALTER TABLE fiscal_periods ADD CONSTRAINT valid_dates CHECK (start_date <= end_date);
ALTER TABLE fiscal_periods ADD CONSTRAINT no_overlapping_periods EXCLUDE USING gist (daterange(start_date,end_date,'[]') WITH &&);
ALTER TABLE chart_of_accounts ADD CONSTRAINT normal_balance_category CHECK ((category IN ('ASET','BEBAN') AND normal_balance='DEBIT') OR (category IN ('KEWAJIBAN','EKUITAS','PENDAPATAN') AND normal_balance='KREDIT'));
ALTER TABLE chart_of_accounts ADD CONSTRAINT cash_is_asset CHECK (NOT is_cash OR category='ASET');
ALTER TABLE journal_lines ADD CONSTRAINT valid_amounts CHECK (debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
CREATE FUNCTION protect_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p fiscal_periods%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.status='POSTED' THEN RAISE EXCEPTION 'Posted journal is immutable'; END IF;
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM fiscal_periods WHERE id=OLD.fiscal_period_id AND status='CLOSED') THEN RAISE EXCEPTION 'Period is closed'; END IF;
  RETURN OLD;
 END IF;
 SELECT * INTO p FROM fiscal_periods WHERE id=NEW.fiscal_period_id FOR UPDATE;
 IF p.status<>'OPEN' THEN RAISE EXCEPTION 'Period is closed'; END IF;
 IF NEW.transaction_date<p.start_date OR NEW.transaction_date>p.end_date THEN RAISE EXCEPTION 'Date outside fiscal period'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_entry BEFORE INSERT OR UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION protect_entry();
CREATE FUNCTION protect_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid text; eid2 text;
BEGIN
 eid=CASE WHEN TG_OP='DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
 eid2=CASE WHEN TG_OP='UPDATE' THEN OLD.journal_entry_id ELSE eid END;
 IF EXISTS(SELECT 1 FROM journal_entries e JOIN fiscal_periods p ON p.id=e.fiscal_period_id WHERE e.id IN (eid,eid2) AND (e.status='POSTED' OR p.status='CLOSED')) THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER protect_line BEFORE INSERT OR UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION protect_line();
CREATE FUNCTION balanced_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid text; n bigint; d numeric; c numeric;
BEGIN
 eid=CASE WHEN TG_TABLE_NAME='journal_entries' THEN NEW.id WHEN TG_OP='DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
 IF EXISTS(SELECT 1 FROM journal_entries WHERE id=eid) THEN
 SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO n,d,c FROM journal_lines WHERE journal_entry_id=eid;
 IF n<2 OR d<>c THEN RAISE EXCEPTION 'Journal requires at least two balanced lines'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_entry AFTER INSERT OR UPDATE ON journal_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_entry();
CREATE CONSTRAINT TRIGGER balanced_lines AFTER INSERT OR UPDATE OR DELETE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION balanced_entry();
CREATE FUNCTION protect_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status='CLOSED' THEN RAISE EXCEPTION 'Fiscal period cannot be deleted or reopened'; END IF;
 IF NEW.start_date<>OLD.start_date OR NEW.end_date<>OLD.end_date THEN RAISE EXCEPTION 'Period dates are immutable'; END IF;
 IF NEW.status='CLOSED' AND EXISTS(SELECT 1 FROM journal_entries WHERE fiscal_period_id=OLD.id AND status='DRAFT') THEN RAISE EXCEPTION 'Draft journals remain'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_period BEFORE UPDATE OR DELETE ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION protect_period();
CREATE FUNCTION protect_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.is_system_account OR EXISTS(SELECT 1 FROM journal_lines WHERE account_id=OLD.id) THEN RAISE EXCEPTION 'System or used account is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER protect_account BEFORE UPDATE OR DELETE ON chart_of_accounts FOR EACH ROW EXECUTE FUNCTION protect_account();
CREATE FUNCTION protect_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit events are append only'; END $$;
CREATE TRIGGER protect_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION protect_audit();
