CREATE FUNCTION fact_file_company_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM source_files WHERE id=NEW."sourceFileId" AND "companyId"=NEW."companyId") THEN RAISE EXCEPTION 'Source file outside company'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fact_file_company_guard BEFORE INSERT OR UPDATE ON source_facts FOR EACH ROW EXECUTE FUNCTION fact_file_company_guard();
