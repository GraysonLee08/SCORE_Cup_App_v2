// backend/startup.js
// Startup script to ensure dependencies and directories exist

const fs = require('fs');
const path = require('path');

// Ensure required directories exist
const requiredDirs = ['logs', 'backups'];

console.log('🚀 Starting SCORES Cup Tournament API...');

// Create directories if they don't exist
requiredDirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}/`);
  }
});

// Check for package.json and dependencies
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  const pkg = require('./package.json');
  console.log(`📦 Package: ${pkg.name} v${pkg.version}`);
  
  // Check if enhanced dependencies are available
  const requiredDeps = ['validator', 'ws'];
  const missingDeps = requiredDeps.filter(dep => !pkg.dependencies[dep]);
  
  if (missingDeps.length > 0) {
    console.log(`⚠️  Missing enhanced dependencies: ${missingDeps.join(', ')}`);
    console.log('📥 Run "npm install validator ws" to enable all features');
  } else {
    console.log('✅ All enhanced dependencies available');
  }
}

// Start the main server
console.log('🌟 Loading tournament server...');
require('./server.js');