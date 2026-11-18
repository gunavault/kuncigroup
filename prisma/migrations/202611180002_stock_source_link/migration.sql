CREATE UNIQUE INDEX stock_opening_source_once ON business_records("companyId",(data->>'sourceStockFactId')) WHERE data ? 'sourceStockFactId' AND status NOT IN ('CANCELLED','REJECTED');
CREATE FUNCTION grant_manager_company_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."managerId" IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_users u WHERE u.id=NEW."managerId" AND (u."isSuperuser" OR EXISTS(SELECT 1 FROM access_grants g WHERE g."userId"=u.id AND g."companyId"=NEW."companyId"))) THEN RAISE EXCEPTION 'Manager outside company'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grant_manager_company_guard BEFORE INSERT OR UPDATE ON access_grants FOR EACH ROW EXECUTE FUNCTION grant_manager_company_guard();
