CREATE OR REPLACE FUNCTION balanced_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE eid text; n bigint; d numeric; c numeric;
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN eid=NEW.id;
 ELSIF TG_OP='DELETE' THEN eid=OLD.journal_entry_id;
 ELSE eid=NEW.journal_entry_id; END IF;
 IF EXISTS(SELECT 1 FROM journal_entries WHERE id=eid) THEN
 SELECT count(*),coalesce(sum(debit),0),coalesce(sum(credit),0) INTO n,d,c FROM journal_lines WHERE journal_entry_id=eid;
 IF n<2 OR d<>c THEN RAISE EXCEPTION 'Journal requires at least two balanced lines'; END IF;
 END IF;
 RETURN NULL;
END $$;
