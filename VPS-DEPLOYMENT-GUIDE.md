# 🚀 VPS Deployment Guide for SCORES Cup Tournament App

Complete step-by-step guide for deploying to Ubuntu 24.04 VPS with domain configuration.

## 📋 Prerequisites

- **VPS**: Ubuntu 24.04 with root/sudo access
- **Domain**: scorescupchicago.games DNS pointing to your VPS IP
- **Existing App**: Running on port 3000 (will not be affected)
- **Repository**: Private GitHub repo access

## 🎯 Port Configuration

Your tournament app will use these ports to avoid conflicts:
- **Frontend**: Port 8080 (internal Docker port 80)
- **Backend**: Port 8082 (internal Docker port 3002)
- **Database**: Port 5454 (internal Docker port 5432)
- **Domain**: scorescupchicago.games → Port 8080 via Nginx

## 📝 Step-by-Step Deployment

### Step 1: Connect to Your VPS

```bash
ssh your-username@your-vps-ip
```

### Step 2: Clone Your Repository

```bash
# Create application directory
sudo mkdir -p /opt/scores-tournament
sudo chown $USER:$USER /opt/scores-tournament

# Clone your private repository
git clone https://github.com/GraysonLee08/SCORE_Cup_App_v2.git /opt/scores-tournament

# Navigate to the app directory
cd /opt/scores-tournament
```

### Step 3: Run the Automated Deployment Script

```bash
# Make the deployment script executable
chmod +x deploy-to-vps.sh

# Run the deployment script (this will take 10-15 minutes)
./deploy-to-vps.sh
```

**What the script does:**
- ✅ Updates system packages
- ✅ Installs Docker & Docker Compose
- ✅ Configures firewall (ports 80, 443, 8080, 8082)
- ✅ Sets up Nginx with domain configuration
- ✅ Builds and starts Docker containers
- ✅ Configures database and runs health checks

### Step 4: Verify Deployment

```bash
# Check if containers are running
docker-compose -f docker-compose.production.yml ps

# Test local access
curl http://localhost:8080        # Frontend
curl http://localhost:8082/health # Backend health check

# Check logs if needed
docker-compose -f docker-compose.production.yml logs -f
```

### Step 5: Configure DNS (If Not Done)

Ensure your domain DNS is configured:

1. **Log into your domain registrar**
2. **Set A Record**: `scorescupchicago.games` → Your VPS IP address
3. **Set A Record**: `www.scorescupchicago.games` → Your VPS IP address
4. **Wait for DNS propagation** (can take up to 48 hours)

Test DNS propagation:
```bash
nslookup scorescupchicago.games
dig scorescupchicago.games
```

### Step 6: Test Your Application

1. **Direct access**: `http://your-vps-ip:8080`
2. **Domain access**: `http://scorescupchicago.games`
3. **Admin panel**: `http://scorescupchicago.games/admin`
   - Password: `ScoresCup312`

## 🔒 SSL Certificate Setup (Recommended)

After DNS is working, secure your site with SSL:

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d scorescupchicago.games -d www.scorescupchicago.games

# Verify auto-renewal
sudo certbot renew --dry-run
```

After SSL installation:
- HTTP traffic will automatically redirect to HTTPS
- Your site will be accessible at `https://scorescupchicago.games`

## 🛠️ Management Commands

### Container Management
```bash
cd /opt/scores-tournament

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f

# Restart services
docker-compose -f docker-compose.production.yml restart

# Stop services
docker-compose -f docker-compose.production.yml down

# Start services
docker-compose -f docker-compose.production.yml up -d

# Rebuild and restart
docker-compose -f docker-compose.production.yml up -d --build
```

### System Monitoring
```bash
# Check system resources
htop
df -h
free -h

# Check Docker resources
docker stats

# Check Nginx status
sudo systemctl status nginx

# Check Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Application Updates
```bash
cd /opt/scores-tournament

# Pull latest changes
git pull origin main

# Rebuild and restart
./build-production.sh
docker-compose -f docker-compose.production.yml up -d --build
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Port 3000 Conflict
**Problem**: "Port 3000 already in use"
**Solution**: ✅ Already configured! App uses ports 3010 and 3012.

#### 2. Domain Not Working
**Problem**: Domain doesn't load the app
**Solutions**:
```bash
# Check DNS
nslookup scorescupchicago.games

# Check Nginx configuration
sudo nginx -t
sudo systemctl status nginx

# Check if app is running
curl http://localhost:8080
```

#### 3. Containers Not Starting
**Problem**: Docker containers fail to start
**Solutions**:
```bash
# Check logs
docker-compose -f docker-compose.production.yml logs

# Restart Docker service
sudo systemctl restart docker

# Clean up and restart
docker-compose -f docker-compose.production.yml down
docker system prune -f
docker-compose -f docker-compose.production.yml up -d --build
```

#### 4. Database Connection Issues
**Problem**: Backend can't connect to database
**Solutions**:
```bash
# Fix database collation
./fix-database-collation.sh

# Check database container
docker-compose -f docker-compose.production.yml logs db

# Restart database
docker-compose -f docker-compose.production.yml restart db
```

#### 5. Nginx Configuration Issues
**Problem**: Nginx errors or domain not working
**Solutions**:
```bash
# Test Nginx configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Check Nginx status
sudo systemctl status nginx

# View Nginx error logs
sudo tail -f /var/log/nginx/error.log
```

## 🔐 Security Considerations

### Firewall Status
```bash
# Check firewall status
sudo ufw status

# Allow additional ports if needed
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
```

### Container Security
- ✅ Containers run with non-root users
- ✅ Health checks prevent cascade failures
- ✅ Resource limits prevent overconsumption
- ✅ Network isolation between containers

### Application Security
- ✅ Admin panel requires authentication
- ✅ No source maps exposed in production
- ✅ Security headers configured in Nginx
- ✅ Database credentials secured

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# Application health
curl http://localhost:8082/health

# Container health
docker-compose -f docker-compose.production.yml ps

# System health
top
df -h
```

### Backup Strategy
```bash
# Backup tournament data
docker run --rm -v scores_tournament-data:/data -v $(pwd):/backup alpine tar czf /backup/tournament-backup-$(date +%Y%m%d).tar.gz -C /data .

# Backup configuration
cp -r /opt/scores-tournament ~/scores-tournament-config-backup
```

### Log Rotation
The application automatically manages logs, but you can check:
```bash
# Application logs
docker-compose -f docker-compose.production.yml logs --tail=100

# System logs
sudo journalctl -u nginx -f
```

## 🎉 Success Checklist

- [ ] VPS accessible via SSH
- [ ] Repository cloned successfully
- [ ] Deployment script completed without errors
- [ ] Containers are running (docker-compose ps shows healthy)
- [ ] Frontend accessible at `http://localhost:8080`
- [ ] Backend health check passes at `http://localhost:8082/health`
- [ ] Domain DNS pointing to VPS IP
- [ ] Website accessible at `http://scorescupchicago.games`
- [ ] Admin panel accessible with password `ScoresCup312`
- [ ] SSL certificate installed (optional but recommended)
- [ ] Firewall configured properly
- [ ] No conflicts with existing app on port 3000

## 📞 Support

If you encounter issues:

1. **Check the logs**: `docker-compose -f docker-compose.production.yml logs -f`
2. **Verify containers**: `docker-compose -f docker-compose.production.yml ps`
3. **Test endpoints**: `curl http://localhost:8080` and `curl http://localhost:8082/health`
4. **Check Nginx**: `sudo nginx -t` and `sudo systemctl status nginx`

Your SCORES Cup Tournament App is now ready for production use! 🏆