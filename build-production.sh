#!/bin/bash

echo "Building SCORES Tournament App for Production..."

# Clean up unnecessary files
echo "Step 1: Cleaning up unnecessary files..."
cd frontend
chmod +x cleanup-production.sh
./cleanup-production.sh
cd ..

# Build the Docker images
echo "Step 2: Building Docker images..."
docker-compose -f docker-compose.production.yml build --no-cache

# Optional: Push to registry
# echo "Step 3: Pushing to Docker registry..."
# docker-compose -f docker-compose.production.yml push

echo "Build complete! To deploy, run:"
echo "  docker-compose -f docker-compose.production.yml up -d"