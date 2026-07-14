-- Check if there are matching predictions for these coin_ledger entries
SELECT p.id, p.tournament_name, p.question
FROM predictions p
WHERE p.id = 'c6ed3a16-7863-4120-b8ee-791aad145f10'
   OR p.id = '4b245457-aeb5-4356-9b37-1ee8c9c86b41'
   OR p.id = 'b99ff1a9-bc71-450a-84b9-187e72723eea'
   OR p.id = '6cce0abb-bca0-4b67-829a-c0f68942e21d'
   OR p.id = '2b61ec46-f91e-4c38-98ea-e652c02a2038';
