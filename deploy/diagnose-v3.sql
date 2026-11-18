SELECT count(*) AS roster FROM master_records WHERE "companyId"='KBA' AND kind='EMPLOYEE' AND data->>'currentRoster'='true';
SELECT data->>'workId' AS work_id,data->'importKeys' AS source_keys FROM master_records WHERE "companyId"='KBA' AND kind='EMPLOYEE' AND data->>'currentRoster'='true' AND jsonb_array_length(data->'importKeys')>1;
SELECT kind,count(*) FROM master_records WHERE data->>'importBatch'='upload-20261118-e84a659afa375656' GROUP BY kind ORDER BY kind;
