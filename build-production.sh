#!/bin/bash

echo "Building SCORES Tournament App for Production..."

# Build the Docker images
echo "Step 1: Building Docker images..."
docker-compose -f docker-compose.production.yml build --no-cache

# Optional: Push to registry
# echo "Step 2: Pushing to Docker registry..."
# docker-compose -f docker-compose.production.yml push

echo "Build complete! To deploy, run:"
echo "  docker-compose -f docker-compose.production.yml up -d"