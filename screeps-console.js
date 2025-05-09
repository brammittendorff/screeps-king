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
  logFilter: process.argv[2] || '', // Optional filter parameter
  logLines: 100
};

// Function to send simple HTTP/HTTPS request 
function sendRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const requester = config.protocol === 'https' ? https : http;
    
    const req = requester.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else {
          reject(new Error(`HTTP Error ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (e) => {
      reject(new Error(`Request failed: ${e.message}`));
    });
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

// Get console logs using REST API (direct HTTP call to game server console)
async function getConsoleLogs() {
  // Set up auth headers
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (config.token) {
    headers['X-Token'] = config.token;
  } else if (config.username && config.password) {
    // Login first to get token
    const loginOptions = {
      hostname: config.hostname,
      port: config.port,
      path: '/api/auth/signin',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    const loginData = JSON.stringify({
      email: config.username,
      password: config.password
    });
    
    try {
      const loginResponse = await sendRequest(loginOptions, loginData);
      if (loginResponse.ok === 1 && loginResponse.token) {
        headers['X-Token'] = loginResponse.token;
      } else {
        throw new Error('Failed to authenticate');
      }
    } catch (e) {
      throw new Error(`Authentication failed: ${e.message}`);
    }
  } else {
    throw new Error('No authentication information provided');
  }
  
  // Try a different path for console logs
  const options = {
    hostname: config.hostname,
    port: config.port,
    path: `/api/user/memory?shard=${config.shard}&path=`,
    method: 'GET',
    headers: headers
  };
  
  try {
    const response = await sendRequest(options);
    
    // Since we're now looking at memory instead of logs, we'll try to run another console command
    // to output our specific debug info

    await sendConsoleCommand(`
      console.log('[MEMORY] Memory keys:', Object.keys(Memory));
      console.log('[CREEPS] Creep count:', Object.keys(Game.creeps).length);
      console.log('[ROOMS] Room names:', Object.keys(Game.rooms));
      if (global.controller && global.controller.memory) {
        console.log('[DEBUG] controller.memory enabled:', true);
      } else {
        console.log('[DEBUG] controller.memory enabled:', false);
      }
    `);

    // Wait a moment for command to execute
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Look at room memory for some insights
    const roomMemoryOptions = {
      hostname: config.hostname,
      port: config.port,
      path: `/api/user/memory?shard=${config.shard}&path=rooms`,
      method: 'GET',
      headers: headers
    };

    const roomMemoryResponse = await sendRequest(roomMemoryOptions);

    return `Memory Keys: ${Object.keys(response.data || {}).join(', ')}\n` +
           `Room Memory: ${JSON.stringify(roomMemoryResponse.data || {}, null, 2)}\n` +
           `(Check Screeps console for more information)`;
  } catch (e) {
    throw new Error(`Failed to get console logs: ${e.message}`);
  }
}

// Helper to send console command
async function sendConsoleCommand(command) {
  // Set up auth headers
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (config.token) {
    headers['X-Token'] = config.token;
  } else {
    throw new Error('Token is required for sending console commands');
  }
  
  // Send console command
  const options = {
    hostname: config.hostname,
    port: config.port,
    path: `/api/user/console?shard=${config.shard}`,
    method: 'POST',
    headers: headers
  };
  
  const postData = JSON.stringify({ 
    expression: command
  });
  
  try {
    const response = await sendRequest(options, postData);
    return response;
  } catch (e) {
    throw new Error(`Failed to send console command: ${e.message}`);
  }
}

// Main function
async function main() {
  try {
    // Wait a bit to ensure game has time to process our code
    console.log(`Waiting 10 seconds for game to process new code...`);
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    console.log(`Fetching console logs from ${config.shard}...`);
    
    // Send a special command to force logging of the important modules and test the specific functions
    console.log(`Sending debug command to log modules state and test functions...`);
    await sendConsoleCommand(`
      console.log('[DEBUG] Testing for controller.memory.updateByCreep function:');

      try {
        let hasError = false;
        let errorMsg = '';

        // Check if controller exists
        if (!global.controller) {
          console.log('[ERROR] global.controller is undefined');
          hasError = true;
          errorMsg = 'global.controller is undefined';
        } else {
          console.log('[INFO] global.controller exists');
          console.log('[INFO] controller keys:', Object.keys(global.controller));

          // Check if controller.memory exists
          if (!global.controller.memory) {
            console.log('[ERROR] global.controller.memory is undefined');
            hasError = true;
            errorMsg = 'global.controller.memory is undefined';
          } else {
            console.log('[INFO] global.controller.memory exists');
            console.log('[INFO] controller.memory keys:', Object.keys(global.controller.memory));

            // Check if updateByCreep function exists
            if (typeof global.controller.memory.updateByCreep !== 'function') {
              console.log('[ERROR] global.controller.memory.updateByCreep is not a function');
              hasError = true;
              errorMsg = 'global.controller.memory.updateByCreep is not a function';
            } else {
              console.log('[SUCCESS] global.controller.memory.updateByCreep is properly defined!');

              // Test with a mock creep
              try {
                const mockCreep = { memory: {} };
                global.controller.memory.updateByCreep(mockCreep);
                console.log('[SUCCESS] Called updateByCreep without errors!');
              } catch (e) {
                console.log('[ERROR] Error calling updateByCreep:', e.message);
                hasError = true;
                errorMsg = 'Error calling updateByCreep: ' + e.message;
              }
            }
          }
        }

        console.log('--- Additional module info ---');
        console.log('[DEBUG] global.ai keys:', Object.keys(global.ai || {}));
        console.log('[DEBUG] global.controller keys:', Object.keys(global.controller || {}));
        console.log('[DEBUG] global.go keys:', Object.keys(global.go || {}));
        console.log('[DEBUG] global.config:', global.config ? 'defined' : 'undefined');
        console.log('[DEBUG] global.patterns:', global.patterns ? 'defined' : 'undefined');
        console.log('[DEBUG] global.templates:', global.templates ? 'defined' : 'undefined');

        if (!hasError) {
          console.log('[RESULT] All checks passed! The bug appears to be fixed.');
        } else {
          console.log('[RESULT] Bug still exists:', errorMsg);
        }
      } catch (e) {
        console.log('[CRITICAL] Test failed with error:', e.message);
      }
    `);
    
    // Wait a bit for the command to execute
    console.log(`Waiting 5 seconds for command execution...`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Now get the logs
    const logs = await getConsoleLogs();
    
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
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();