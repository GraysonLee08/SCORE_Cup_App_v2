FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Clean any existing node_modules and ensure fresh install
RUN rm -rf node_modules
RUN npm install --legacy-peer-deps

# Verify critical dependencies are correct versions
RUN npm ls react-scripts || npm install react-scripts@4.0.3
RUN npm ls webpack || echo "Webpack version check"

# Copy source code
COPY . .

# Set environment variables for stable build
ENV GENERATE_SOURCEMAP=false
ENV SKIP_PREFLIGHT_CHECK=true
ENV REACT_APP_API_URL=http://localhost:3002
ENV NODE_OPTIONS=--max_old_space_size=4096

EXPOSE 3000

CMD ["npm", "start"]