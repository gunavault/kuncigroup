-- Imported catalogs are shared within their company. Physical locations and people
-- remain branch-scoped. Preserve reviewed branch-specific masters and source lineage.
UPDATE master_records AS m
SET "branchId" = NULL,
    data = m.data || jsonb_build_object('scope', 'COMPANY', 'sourceLocation', b.name)
FROM branches AS b
WHERE m."branchId" = b.id AND m."companyId" = b."companyId"
  AND m.kind IN ('PRODUCT', 'PARTNER', 'BOM', 'DEPARTMENT', 'POSITION', 'ASSET_CLASS')
  AND m.data ? 'importBatch'
  AND COALESCE(m.data->>'sourceVerification', '') <> 'VERIFIED';
