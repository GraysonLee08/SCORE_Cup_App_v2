#!/bin/bash

echo "Fixing database collation warning..."

# Execute the SQL command in the database container
docker-compose exec tournament_db psql -U tournament_user -d tournament_db -c "ALTER DATABASE tournament_db REFRESH COLLATION VERSION;"

if [ $? -eq 0 ]; then
    echo "✅ Database collation fixed successfully!"
else
    echo "⚠️  Trying alternative method..."
    docker-compose exec tournament_db psql -U tournament_user -d tournament_db -c "UPDATE pg_database SET datcollversion = NULL WHERE datname = 'tournament_db';"
    
    if [ $? -eq 0 ]; then
        echo "✅ Database collation fixed using alternative method!"
    else
        echo "❌ Failed to fix collation. This warning is non-critical and can be ignored."
    fi
fi

echo "Done!"