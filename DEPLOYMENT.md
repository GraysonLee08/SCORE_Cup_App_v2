# Production Deployment Guide

## Overview
This guide provides instructions for deploying the SCORES Tournament App in a production environment.

## Files Created for Production

### 1. **Dockerfile.production**
- Multi-stage build reduces image size by ~70%
- Stage 1: Builds React app with Node
- Stage 2: Serves static files with nginx
- Final image size: ~20MB (nginx alpine)

### 2. **.dockerignore**
- Prevents unnecessary files from being copied to Docker image
- Excludes: node_modules, .git, logs, build artifacts

### 3. **docker-compose.production.yml**
- Production-ready orchestration
- Includes restart policies
- Persistent volume for backend data
- Network isolation

### 4. **package.production.json**
- Removed testing libraries (@testing-library, jest-dom, web-vitals)
- Contains only runtime dependencies
- Reduces node_modules size by ~30%

### 5. **cleanup-production.sh**
- Removes unused files:
  - SimpleApp.js (demo component)
  - index-simple.js, index.production.js (unused entry points)
  - TabButton.js (unused component)
  - tournament-grid-backup.css (backup file)

## Deployment Steps

### 1. Prepare for Production
```bash
# Make scripts executable
chmod +x build-production.sh
chmod +x frontend/cleanup-production.sh

# Run the build script
./build-production.sh
```

### 2. Deploy with Docker Compose
```bash
# Start the application
docker-compose -f docker-compose.production.yml up -d

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f
```

### 3. Access the Application
- Frontend: http://your-domain.com (port 80)
- Backend API: http://your-domain.com/api (proxied through nginx)

## Environment Variables

### Frontend (.env.production)
- `REACT_APP_API_URL=/api` - API endpoint (proxied through nginx)
- `GENERATE_SOURCEMAP=false` - Disable source maps for security
- `NODE_ENV=production` - Production mode

### Backend
- `NODE_ENV=production` - Production mode
- `PORT=3002` - Backend port

## Security Considerations

1. **Source Maps Disabled** - Prevents exposing source code
2. **Docker Network Isolation** - Services communicate internally
3. **Nginx Proxy** - Hides backend port from external access
4. **Minimal Docker Images** - Alpine-based for smaller attack surface

## Performance Optimizations

1. **Multi-stage Docker Build** - Reduces image size by 70%
2. **Production React Build** - Minified and optimized
3. **Nginx Static Serving** - Efficient static file serving
4. **Browser Caching** - Leverages React's built-in cache busting

## Monitoring

```bash
# Check container resource usage
docker stats

# Check disk usage
docker system df

# Clean up unused images/containers
docker system prune -a
```

## Backup

```bash
# Backup tournament data
docker run --rm -v scores_tournament-data:/data -v $(pwd):/backup alpine tar czf /backup/tournament-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore from backup
docker run --rm -v scores_tournament-data:/data -v $(pwd):/backup alpine tar xzf /backup/tournament-backup-YYYYMMDD.tar.gz -C /data
```

## Troubleshooting

### Issue: Container won't start
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs frontend
docker-compose -f docker-compose.production.yml logs backend

# Rebuild images
docker-compose -f docker-compose.production.yml build --no-cache
```

### Issue: API connection fails
- Verify nginx configuration in Dockerfile.production
- Check backend is running: `docker-compose -f docker-compose.production.yml ps`
- Test API directly: `curl http://localhost:3002/api/health`

## Rollback Procedure

```bash
# Stop current deployment
docker-compose -f docker-compose.production.yml down

# Restore previous version (tag your images!)
docker-compose -f docker-compose.production.yml up -d --force-recreate
```

## Updates

To deploy updates:
1. Pull latest code
2. Run `./build-production.sh`
3. Deploy with zero downtime:
   ```bash
   docker-compose -f docker-compose.production.yml up -d --no-deps --build frontend
   docker-compose -f docker-compose.production.yml up -d --no-deps --build backend
   ```