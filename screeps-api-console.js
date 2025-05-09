const https = require('https');
const http = require('http');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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
  logFilter: process.argv[2] || '' // Optional filter parameter
};

// Function to authenticate and get token (if not provided)
function authenticate(callback) {
  if (config.token) {
    // Already have token
    callback(null, config.token);
    return;
  }

  if (!config.username || !config.password) {
    callback(new Error('No authentication information provided. Set SCREEPS_TOKEN or SCREEPS_USERNAME and SCREEPS_PASSWORD.'), null);
    return;
  }

  // Choose the protocol based on config
  const requester = config.protocol === 'https' ? https : http;
  
  const data = JSON.stringify({
    email: config.username,
    password: config.password
  });
  
  const options = {
    hostname: config.hostname,
    port: config.port,
    path: '/api/auth/signin',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  
  const req = requester.request(options, (res) => {
    let responseData = '';
    
    res.on('data', (chunk) => {
      responseData += chunk;
    });
    
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response = JSON.parse(responseData);
          if (response.ok === 1 && response.token) {
            callback(null, response.token);
          } else {
            callback(new Error('Failed to get token from API response'), null);
          }
        } catch (e) {
          callback(new Error(`Failed to parse API response: ${e.message}`), null);
        }
      } else {
        callback(new Error(`Authentication failed with status code ${res.statusCode}: ${responseData}`), null);
      }
    });
  });
  
  req.on('error', (e) => {
    callback(new Error(`Authentication request failed: ${e.message}`), null);
  });
  
  req.write(data);
  req.end();
}

// Function to retrieve and filter console messages using WebSocket
function getConsoleMessages(token, callback) {
  // Setup WebSocket connection
  const protocol = config.protocol === 'https' ? 'wss' : 'ws';
  const socketUrl = `${protocol}://${config.hostname}:${config.port}/socket/websocket`;
  
  console.log(`Connecting to WebSocket at ${socketUrl}`);
  const ws = new WebSocket(socketUrl);
  
  let messages = [];
  let timeout;
  
  ws.on('open', () => {
    console.log('WebSocket connection established');
    
    // Send authentication
    ws.send(JSON.stringify({
      auth: token,
    }));
    
    // Subscribe to console events for the specified shard
    ws.send(JSON.stringify({
      subscribe: `user:${config.shard}/console`
    }));
    
    // Set a timeout to collect messages
    timeout = setTimeout(() => {
      console.log('Timeout reached, retrieving collected messages...');
      ws.close();

      // Apply filter if needed
      if (config.logFilter) {
        messages = messages.filter(line => line.includes(config.logFilter));
      }

      callback(null, messages.join('\n'));
    }, 15000); // Wait for 15 seconds to collect logs
  });
  
  ws.on('message', (data) => {
    const strData = data.toString();
    // Skip non-JSON messages like "ping", "pong", "id:123"
    if (strData.startsWith('ping') || strData.startsWith('pong') || strData.startsWith('id:')) {
      return;
    }

    try {
      const parsed = JSON.parse(strData);

      // Check if it's a console message
      if (parsed.type === 'user' &&
          parsed.data &&
          parsed.data.messages &&
          parsed.data.messages.log) {

        // Add each log message to our collection
        messages = messages.concat(parsed.data.messages.log);
        console.log(`Received ${parsed.data.messages.log.length} console messages`);
      }
    } catch (e) {
      console.log(`Failed to parse WebSocket message: ${strData.substring(0, 100)}`);
    }
  });
  
  ws.on('error', (error) => {
    clearTimeout(timeout);
    callback(new Error(`WebSocket error: ${error.message}`), null);
    ws.close();
  });
  
  ws.on('close', () => {
    clearTimeout(timeout);
    console.log('WebSocket connection closed');
  });
}

// Main function
function main() {
  console.log(`Preparing to fetch console logs from ${config.shard}...`);
  console.log(`Waiting 10 seconds for game code to run before fetching logs...`);

  // Add a delay before fetching logs to allow time for the game to process our code
  setTimeout(() => {
    console.log(`Fetching console logs from ${config.shard}...`);

    authenticate((authError, token) => {
      if (authError) {
        console.error(authError.message);
        process.exit(1);
      }

      console.log('Authentication successful');

      getConsoleMessages(token, (error, logs) => {
      if (error) {
        console.error(error.message);
        process.exit(1);
      }
      
      console.log('----- Console Logs -----');
      console.log(logs);
      console.log('----- End Logs -----');
      
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
  });
  }, 10000); // 10 second delay
}

main();