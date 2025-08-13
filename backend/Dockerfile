FROM node:18-alpine
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install

# Install additional dependencies for enhanced features
RUN npm install validator ws || echo "Enhanced dependencies install failed, will use fallback mode"

COPY . .

# Create required directories for enhanced features
RUN mkdir -p logs backups

EXPOSE 3002
CMD ["npm", "start"]