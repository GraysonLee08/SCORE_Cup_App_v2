FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install

# Install additional dependencies for enhanced features
RUN npm install validator ws || echo "Enhanced dependencies install failed, will use fallback mode"

COPY . .

# Create required directories for enhanced features
RUN mkdir -p logs backups

EXPOSE 3002
CMD ["npm", "start"]