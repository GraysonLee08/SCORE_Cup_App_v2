#!/bin/bash

echo "Cleaning up unnecessary files for production..."

# Remove unused components
rm -f src/SimpleApp.js
rm -f src/index-simple.js
rm -f src/index.production.js
rm -f src/components/common/TabButton.js

# Remove backup CSS files
rm -f src/styles/tournament-grid-backup.css

# Remove development Dockerfiles (keep production one)
rm -f Dockerfile-minimal
rm -f package-minimal.json

# Remove test files if they exist
rm -rf src/**/*.test.js
rm -rf src/**/*.spec.js
rm -rf src/setupTests.js

echo "Cleanup complete!"