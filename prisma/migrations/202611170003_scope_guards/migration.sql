-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "effectiveDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE fiscal_periods ADD CONSTRAINT period_company_pair UNIQUE(id,company_id);
ALTER TABLE journal_entries ADD CONSTRAINT journal_company_period_fk FOREIGN KEY(fiscal_period_id,company_id) REFERENCES fiscal_periods(id,company_id);
ALTER TABLE attachments ADD CONSTRAINT attachment_company_fk FOREIGN KEY(company_id) REFERENCES companies(id);
ALTER TABLE chart_of_accounts DROP CONSTRAINT cash_is_asset;
ALTER TABLE chart_of_accounts ADD CONSTRAINT cash_is_asset CHECK (NOT is_cash OR (category='ASET' AND NOT is_contra));
CREATE FUNCTION company_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='fiscal_periods' THEN
   IF OLD.company_id<>NEW.company_id THEN RAISE EXCEPTION 'Cannot move fiscal period between companies'; END IF;
 ELSE
   IF OLD."companyId"<>NEW."companyId" THEN RAISE EXCEPTION 'Cannot move records between companies'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER company_identity_guard BEFORE UPDATE ON fiscal_periods FOR EACH ROW EXECUTE FUNCTION company_identity_guard();
CREATE TRIGGER company_identity_guard BEFORE UPDATE ON business_records FOR EACH ROW EXECUTE FUNCTION company_identity_guard();
CREATE TRIGGER company_identity_guard BEFORE UPDATE ON master_records FOR EACH ROW EXECUTE FUNCTION company_identity_guard();
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_record_fk FOREIGN KEY("recordId") REFERENCES business_records(id);
ALTER TABLE stock_movements ADD CONSTRAINT stock_movement_lot_fk FOREIGN KEY("lotId") REFERENCES stock_lots(id);
