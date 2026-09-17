// Chargé dans CHAQUE worker Vitest, y compris lors d'un appel direct à vitest.
// Port fermé : une dépendance non doublée échoue, elle ne lit jamais le .env métier.
process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/qualiof_unit_test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.AUTH_SECRET = 'unit-test-0123456789abcdef0123456789abcdef';
process.env.STORAGE_PROVIDER = 'minio';
