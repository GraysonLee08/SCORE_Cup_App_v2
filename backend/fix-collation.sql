-- Fix collation version mismatch warning
-- Run this inside the PostgreSQL container

-- Refresh the collation version for the database
ALTER DATABASE tournament_db REFRESH COLLATION VERSION;

-- If the above doesn't work, you can also try:
-- UPDATE pg_database SET datcollversion = NULL WHERE datname = 'tournament_db';