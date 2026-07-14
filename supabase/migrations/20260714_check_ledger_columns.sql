-- Check if coin_ledger has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'coin_ledger'
ORDER BY ordinal_position;
