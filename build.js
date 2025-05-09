#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Check if screeps.json exists
if (!fs.existsSync('./screeps.json')) {
  console.log('Creating screeps.json template');
  
  // Create a template screeps.json file if it doesn't exist
  const screepsConfig = {
    main: {
      token: process.env.SCREEPS_TOKEN || 'YOUR_TOKEN_HERE',
      protocol: 'https',
      hostname: 'screeps.com',
      port: 443,
      path: '/',
      branch: 'main'
    },
    sim: {
      token: process.env.SCREEPS_TOKEN || 'YOUR_TOKEN_HERE',
      protocol: 'https',
      hostname: 'screeps.com',
      port: 443,
      path: '/',
      branch: 'sim'
    }
  };
  
  fs.writeFileSync('./screeps.json', JSON.stringify(screepsConfig, null, 2));
  console.log('Created screeps.json template. Please edit it with your credentials.');
}

// Get deployment target from command line arguments
const args = process.argv.slice(2);
const deployTarget = args.includes('--deploy') ? args[args.indexOf('--deploy') + 1] || 'main' : null;

// Build with webpack
console.log('Building with webpack...');
try {
  if (deployTarget) {
    console.log(`Deploying to ${deployTarget}...`);
    execSync(`webpack --env DEPLOY_DEST=${deployTarget}`, { stdio: 'inherit' });
  } else {
    console.log('Building without deployment...');
    execSync('webpack', { stdio: 'inherit' });
  }
  console.log('Build successful!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}