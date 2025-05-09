const https = require('https');
const http = require('http');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

const config = {
  protocol: process.env.SCREEPS_PROTOCOL || 'https',
  hostname: process.env.SCREEPS_HOST || 'screeps.com',
  port: process.env.SCREEPS_PORT || 443,
  token: process.env.SCREEPS_TOKEN,
  username: process.env.SCREEPS_USERNAME,
  password: process.env.SCREEPS_PASSWORD,
  shard: process.env.SCREEPS_SHARD || 'shard3',
  lines: process.env.LOG_LINES || 100,
  logFilter: process.argv[2] || '' // Optional filter parameter
};

// Function to get console logs
function getConsoleLogs(callback) {
  // Choose the protocol based on config
  const requester = config.protocol === 'https' ? https : http;
  
  // Set up auth headers
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (config.token) {
    headers['X-Token'] = config.token;
  } else if (config.username && config.password) {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    headers['Authorization'] = `Basic ${auth}`;
  } else {
    console.error('No authentication information provided. Set SCREEPS_TOKEN or SCREEPS_USERNAME and SCREEPS_PASSWORD.');
    process.exit(1);
  }
  
  // Prepare the path with parameters
  let urlPath = `/api/user/console-messages?shard=${config.shard}&limit=${config.lines}`;
  
  // Prepare the request options
  const options = {
    hostname: config.hostname,
    port: config.port,
    path: urlPath,
    method: 'GET',
    headers: headers
  };
  
  // Make the request
  const req = requester.request(options, (res) => {
    let data = '';
    
    // Handle response data
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    // Handle the end of the response
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(data);
          if (response.ok === 1) {
            callback(null, response.messages.join('\n'));
          } else {
            callback(new Error('API returned an error'), null);
          }
        } catch (e) {
          callback(new Error(`Failed to parse API response: ${e.message}`), null);
        }
      } else {
        callback(new Error(`API returned status code ${res.statusCode}: ${data}`), null);
      }
    });
  });
  
  // Handle request errors
  req.on('error', (e) => {
    callback(new Error(`Request failed: ${e.message}`), null);
  });
  
  // Finish the request
  req.end();
}

// Main function
function main() {
  console.log(`Fetching the last ${config.lines} console logs from ${config.shard}...`);
  
  getConsoleLogs((error, logs) => {
    if (error) {
      console.error(error.message);
      process.exit(1);
    }
    
    // Filter logs if a filter string is provided
    if (config.logFilter) {
      const filteredLogs = logs.split('\n')
        .filter(line => line.includes(config.logFilter))
        .join('\n');
      console.log(filteredLogs);
    } else {
      console.log(logs);
    }
    
    // Save logs to a file for reference
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logsDir = path.join(__dirname, 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    
    const filePath = path.join(logsDir, `screeps-logs-${timestamp}.txt`);
    fs.writeFileSync(filePath, logs);
    console.log(`Logs saved to ${filePath}`);
  });
}

main();