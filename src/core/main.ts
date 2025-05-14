/**
 * Main game loop
 * Entry point for the Screeps game engine
 * Enhanced with multi-room colony management
 */

import { CONFIG } from '../configuration';
import { Logger } from '../utils/logger';
import { StatsDisplay } from '../utils/stats-display';
import { MemoryManager } from '../management/memory-manager';
import { CreepManager, CreepRole } from '../management/creep-manager';
import { runRoomLogic, runRooms, initRoomManager } from '../management/room-manager';
import { ColonyManager } from '../management/colony-manager';
import { StructureManager } from '../management/structure-manager';
import { TaskManager } from '../management/task-manager';
import { AI } from '../roles';
import * as _ from 'lodash';
import { MarketTrends } from '../utils/market-trends';
import { RoomCache } from '../utils/room-cache';
import { LinkNetwork } from '../utils/link-network';
import { globalInit } from './global';
import { RoomMapper } from '../planners/RoomPlanner';

// Initialize global objects to maintain compatibility with the old code
global.ai = AI as any;
global.config = {
  version: CONFIG.VERSION,
  BUILD_ID: CONFIG.BUILD_ID
};

// Add debug helpers to global object
global.debug = {
  showErrors: true,
  traceCreepErrors: true,
  logMemoryStats: false
};

// Initialize global.go and resource functions to prevent undefined errors
global.go = {
  resource: {
    selectClosestTo: function(creep) {
      const localSources = creep.room.find(FIND_SOURCES);
      if (localSources.length > 0) {
        const source = creep.pos.findClosestByRange(localSources);
        return source ? source.id : null;
      }
      return null;
    }
  }
};

// Add detailed error tracing to module execution
function safeExecute(name: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    Logger.error(`Error in module ${name}: ${(e as Error).message}`);
    Logger.error(`${(e as Error).stack}`);
    console.log(`ERROR in ${name}: ${(e as Error).message}\n${(e as Error).stack}`);
  }
}

// Main game loop
export function loop() {
  // Start of tick timing
  const cpuStart = Game.cpu.getUsed();
  
  try {
    // Initialize all global variables if needed
    if (!global.initialized) {
      globalInit();
      global.initialized = true;
    }
    
    // Run memory management first to clean up memory
    safeExecute('MemoryManager', () => MemoryManager.run());
    
    // Plan creeps first (for each room), then process spawns
    safeExecute('CreepManager.planAllRooms', () => {
      // Plan creeps for all owned rooms
      for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (room.controller && room.controller.my) {
          // Build room profile
          const roomProfile = CreepManager.buildRoomProfile(room);
          const empireProfile = CreepManager.buildEmpireProfile();
          
          // Plan creeps based on profile
          const requests = CreepManager.planCreeps(roomProfile, empireProfile);
          
          // Add requests to spawn queue
          for (const request of requests) {
            CreepManager.requestCreep(request);
          }
        }
      }
    });
    
    // Process spawn queue
    safeExecute('CreepManager.processSpawns', () => CreepManager.processSpawns());
    
    // Run room logic
    safeExecute('RoomManager', () => runRooms());
    
    // Process all creeps
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      if (!creep.spawning) {
        safeExecute(`Creep ${name}`, () => {
          const role = creep.memory.role;
          if (role && AI[role] && AI[role].task) {
            try {
              AI[role].task(creep);
            } catch (e) {
              if (global.debug.traceCreepErrors) {
                Logger.error(`Error running ${role} AI for ${name}: ${(e as Error).message}`);
                console.log(`Creep ERROR [${role}] ${name}: ${(e as Error).message}\n${(e as Error).stack}`);
              }
            }
          } else {
            creep.say('❓ No AI');
            // Default idle behavior if no AI found
            creep.moveTo(25, 25);
          }
        });
      }
    }
    
    // Run structure logic (towers, links, etc.)
    safeExecute('StructureManager', () => StructureManager.run());
    
    // Process links
    safeExecute('LinkNetwork', () => LinkNetwork.run());
    
    // Run colony manager for multi-room coordination
    safeExecute('ColonyManager', () => ColonyManager.run());
    
    // Update market data periodically
    if (Game.time % 10 === 0) {
      safeExecute('MarketTrends', () => MarketTrends.update());
    }
    
    // End of tick CPU logging
    if (Game.time % 100 === 0) {
      const cpuEnd = Game.cpu.getUsed();
      Logger.info(`Tick ${Game.time} - CPU: ${cpuEnd.toFixed(2)}/${Game.cpu.limit}, Bucket: ${Game.cpu.bucket}/10000`);
      
      // Display stats if enabled
      StatsDisplay.run();
      
      // Log memory usage if enabled
      if (global.debug.logMemoryStats) {
        const memorySize = RawMemory.get().length;
        Logger.info(`Memory usage: ${(memorySize / 1024).toFixed(2)} KB / 2048 KB (${(memorySize / 2048 / 10.24).toFixed(2)}%)`);
      }
    }
    
    // Clear expired room cache
    RoomCache.cleanup();
    
  } catch (e) {
    // Catch any uncaught errors to prevent the entire game from crashing
    Logger.critical(`Uncaught error in main loop: ${(e as Error).message}`);
    Logger.critical(`${(e as Error).stack}`);
    console.log(`CRITICAL ERROR: ${(e as Error).message}\n${(e as Error).stack}`);
  }
}