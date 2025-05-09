const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration from environment variables
const config = {
  token: process.env.SCREEPS_TOKEN,
  username: process.env.SCREEPS_USERNAME,
  password: process.env.SCREEPS_PASSWORD,
  branch: process.env.SCREEPS_BRANCH || 'master',
  hostname: process.env.SCREEPS_HOST || 'screeps.com',
  port: process.env.SCREEPS_PORT || 443,
  protocol: process.env.SCREEPS_PROTOCOL || 'https',
  shard: process.env.SCREEPS_SHARD || null,
};

// Upload code function
function uploadCode() {
  const shardInfo = config.shard ? ` shard: ${config.shard}` : '';
  console.log(`Uploading code to ${config.hostname} branch: ${config.branch}${shardInfo}`);
  
  // Read all JS files from dist directory
  const distPath = path.join(__dirname, 'dist');
  const files = {};
  
  try {
    // Read main.js - this is the compiled code
    const mainJsPath = path.join(distPath, 'main.js');
    if (fs.existsSync(mainJsPath)) {
      files['main'] = fs.readFileSync(mainJsPath, 'utf8');
      console.log('Found main.js');
    } else {
      console.error('Error: main.js not found in dist directory');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error reading dist directory:', error);
    process.exit(1);
  }

  // Prepare request options
  const options = {
    hostname: config.hostname,
    port: config.port,
    path: '/api/user/code',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  // Add shard parameter if specified
  if (config.shard) {
    options.path = `/api/user/code?shard=${config.shard}`;
  }

  // Add authentication
  if (config.token) {
    options.headers['X-Token'] = config.token;
    console.log('Using token authentication');
  } else if (config.username && config.password) {
    options.auth = `${config.username}:${config.password}`;
    console.log('Using username/password authentication');
  } else {
    console.error('Error: No authentication provided');
    process.exit(1);
  }

  // Prepare request data
  const requestData = JSON.stringify({
    branch: config.branch,
    modules: files
  });

  // Create HTTP or HTTPS request
  const req = (config.protocol === 'https' ? https : http).request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log('Code successfully uploaded!');
      } else {
        console.error(`Error uploading code: ${res.statusCode} ${res.statusMessage}`);
        console.error(data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('Error uploading code:', error);
  });

  // Send the request
  req.write(requestData);
  req.end();
}

// If this script is run directly, upload the code
if (require.main === module) {
  uploadCode();
}

module.exports = { uploadCode };