-- Check if there are matching prediction_entries for these coin_ledger entries
SELECT pe.id, pe.prediction_id, pe.option_id, pe.amount, pe.user_id
FROM prediction_entries pe
WHERE pe.prediction_id = 'c6ed3a16-7863-4120-b8ee-791aad145f10'
   OR pe.prediction_id = '4b245457-aeb5-4356-9b37-1ee8c9c86b41'
   OR pe.prediction_id = 'b99ff1a9-bc71-450a-84b9-187e72723eea'
   OR pe.prediction_id = '6cce0abb-bca0-4b67-829a-c0f68942e21d'
   OR pe.prediction_id = '2b61ec46-f91e-4c38-98ea-e652c02a2038';
