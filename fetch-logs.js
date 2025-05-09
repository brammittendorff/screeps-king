const https = require('https');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const token = process.env.SCREEPS_TOKEN;
if (!token) {
  console.error('No token found in .env file');
  process.exit(1);
}

// Function to make HTTP request to Screeps API
function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'screeps.com',
      path: path,
      method: 'GET',
      headers: {
        'X-Token': token
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(`HTTP Error: ${res.statusCode} ${res.statusMessage}`);
          return;
        }

        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (e) {
          reject(`Failed to parse response: ${e.message}\nData: ${data}`);
        }
      });
    });

    req.on('error', (e) => {
      reject(`Request error: ${e.message}`);
    });

    req.end();
  });
}

// Main execution
async function main() {
  try {
    // Get user info
    console.log('Fetching user info...');
    const userInfo = await makeRequest('/api/auth/me');
    console.log('User Info:', JSON.stringify(userInfo, null, 2));

    // Get game info
    console.log('\nFetching game info...');
    const gameInfo = await makeRequest('/api/game/info');
    console.log('Game Info:', JSON.stringify(gameInfo, null, 2));

    // Get user rooms
    console.log('\nFetching user rooms...');
    const rooms = await makeRequest('/api/user/rooms');
    console.log('Rooms:', JSON.stringify(rooms, null, 2));

    // Try to get the console API
    console.log('\nFetching console logs (polling)...');
    try {
      const logs = await makeRequest('/api/user/console?limit=10');
      console.log('Console logs:', JSON.stringify(logs, null, 2));
    } catch (e) {
      console.log('Could not fetch console logs:', e);
    }

  } catch (error) {
    console.error('Error:', error);
  }
}

main();