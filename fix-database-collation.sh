#!/bin/bash

echo "Fixing database collation warnings for all databases..."

# Fix tournament_db
echo "🔧 Fixing tournament_db collation..."
docker-compose exec tournament_db psql -U tournament_user -d tournament_db -c "ALTER DATABASE tournament_db REFRESH COLLATION VERSION;"

# Fix postgres database
echo "🔧 Fixing postgres database collation..."
docker-compose exec tournament_db psql -U tournament_user -d postgres -c "ALTER DATABASE postgres REFRESH COLLATION VERSION;"

# Fix template1 database
echo "🔧 Fixing template1 database collation..."
docker-compose exec tournament_db psql -U tournament_user -d template1 -c "ALTER DATABASE template1 REFRESH COLLATION VERSION;"

echo ""
echo "📊 Current database collation versions:"
docker-compose exec tournament_db psql -U tournament_user -d postgres -c "SELECT datname, datcollversion FROM pg_database WHERE datcollversion IS NOT NULL;"

echo ""
echo "✅ All database collations updated successfully!"
echo "Done!"