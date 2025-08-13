#!/bin/bash
# Deployment script for SCORES Cup Tournament App on Ubuntu 24.04 VPS

set -e  # Exit on any error

echo "🚀 Starting SCORES Cup Tournament App Deployment"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   print_error "This script should not be run as root. Please run as a regular user with sudo privileges."
   exit 1
fi

# Update system packages
print_status "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
print_status "Installing required packages..."
sudo apt install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    nginx \
    git \
    ufw

# Install Docker if not already installed
if ! command -v docker &> /dev/null; then
    print_status "Installing Docker..."
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io
    sudo usermod -aG docker $USER
    print_success "Docker installed successfully"
else
    print_success "Docker is already installed"
fi

# Install Docker Compose if not already installed
if ! command -v docker-compose &> /dev/null; then
    print_status "Installing Docker Compose..."
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed successfully"
else
    print_success "Docker Compose is already installed"
fi

# Configure firewall
print_status "Configuring firewall..."
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 8080  # Tournament app frontend
sudo ufw allow 8082  # Tournament app backend
sudo ufw allow 5454  # Tournament app database
sudo ufw --force enable
print_success "Firewall configured"

# Set up application directory
APP_DIR="/opt/scores-tournament"
print_status "Setting up application directory at $APP_DIR..."
sudo mkdir -p $APP_DIR
sudo chown $USER:$USER $APP_DIR

# Clone the repository
print_status "Cloning repository..."
if [ -d "$APP_DIR/.git" ]; then
    print_status "Repository already exists, pulling latest changes..."
    cd $APP_DIR
    git pull origin main
else
    print_status "Cloning fresh repository..."
    git clone https://github.com/GraysonLee08/SCORE_Cup_App_v2.git $APP_DIR
    cd $APP_DIR
fi

print_success "Repository ready"

# Make scripts executable
chmod +x build-production.sh
chmod +x fix-database-collation.sh

# Configure Nginx
print_status "Configuring Nginx..."
sudo cp nginx/scorescupchicago.games.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/scorescupchicago.games.conf /etc/nginx/sites-enabled/

# Test Nginx configuration
sudo nginx -t
if [ $? -eq 0 ]; then
    print_success "Nginx configuration is valid"
    sudo systemctl reload nginx
else
    print_error "Nginx configuration has errors. Please check the configuration."
    exit 1
fi

# Build and start the application
print_status "Building Docker images..."
./build-production.sh

print_status "Starting the application..."
docker-compose -f docker-compose.production.yml up -d

# Wait for services to be ready
print_status "Waiting for services to start..."
sleep 30

# Fix database collation
print_status "Fixing database collation..."
./fix-database-collation.sh

# Check if services are running
print_status "Checking service status..."
docker-compose -f docker-compose.production.yml ps

# Test application endpoints
print_status "Testing application endpoints..."
sleep 10

# Test frontend
if curl -f http://localhost:8080 > /dev/null 2>&1; then
    print_success "Frontend is responding on port 8080"
else
    print_warning "Frontend is not responding on port 8080"
fi

# Test backend health
if curl -f http://localhost:8082/health > /dev/null 2>&1; then
    print_success "Backend health check passed on port 8082"
else
    print_warning "Backend health check failed on port 8082"
fi

# Final instructions
echo ""
echo "🎉 Deployment Complete!"
echo "======================="
print_success "SCORES Cup Tournament App has been deployed successfully!"
echo ""
echo "📍 Access URLs:"
echo "   • Local Frontend: http://localhost:8080"
echo "   • Local Backend:  http://localhost:8082"
echo "   • Health Check:   http://localhost:8082/health"
echo ""
echo "🌐 Domain Setup:"
echo "   1. Ensure scorescupchicago.games DNS A record points to this server's IP"
echo "   2. Test: http://scorescupchicago.games"
echo ""
echo "🔒 SSL Setup (Optional but Recommended):"
echo "   sudo apt install certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d scorescupchicago.games -d www.scorescupchicago.games"
echo ""
echo "📊 Monitoring Commands:"
echo "   • Check containers: docker-compose -f docker-compose.production.yml ps"
echo "   • View logs:        docker-compose -f docker-compose.production.yml logs -f"
echo "   • Restart app:      docker-compose -f docker-compose.production.yml restart"
echo ""
echo "🔐 Admin Access:"
echo "   • URL: http://scorescupchicago.games/admin"
echo "   • Password: ScoresCup312"
echo ""
print_success "Deployment script completed successfully!"