@echo off
echo 🧹 Cleaning Docker cache and rebuilding SCORES Cup Tournament...
echo.

echo 1️⃣ Stopping and removing containers...
docker-compose down --volumes --remove-orphans

echo 2️⃣ Pruning Docker system (this may take a moment)...
docker system prune -af --volumes

echo 3️⃣ Building with no cache...
docker-compose build --no-cache

echo 4️⃣ Starting containers...
docker-compose up

echo.
echo ✅ Clean rebuild complete!