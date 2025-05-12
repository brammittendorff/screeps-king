/**
 * Main game loop
 * Entry point for the Screeps game engine
 * Enhanced with multi-room colony management
 */

import { CONFIG } from './config';
import { Logger } from './utils/logger';
import { Profiler } from './utils/profiler';
import { StatsDisplay } from './utils/stats-display';
import { MemoryManager } from './managers/memory-manager';
import { CreepManager } from './managers/creep-manager';
import { RoomManager } from './managers/room-manager';
import { ColonyManager } from './managers/colony-manager';
import { StructureManager } from './managers/structure-manager';
import { TaskManager } from './managers/task-manager';
import { AI } from './ai';
import * as _ from 'lodash';
import { MarketTrends } from './utils/market-trends';

// Initialize global objects to maintain compatibility with the old code
global.ai = AI as any;
global.config = {
  version: CONFIG.VERSION,
  BUILD_ID: CONFIG.BUILD_ID
};

// Initialize global.go and resource functions to prevent undefined errors
global.go = {
  resource: {
    selectClosestTo: function(entity) {
      try {
        if (!entity || !entity.room) return null;
        
        const sources = entity.room.find(FIND_SOURCES);
        if (!sources || sources.length === 0) return null;
        
        const source = entity.pos.findClosestByRange(sources);
        return source ? source.id : null;
      } catch (e) {
        console.log(`Error finding closest source: ${e}`);
        return null;
      }
    },
    selectSecondClosestTo: function(entity) {
      try {
        if (!entity || !entity.room) return null;
        
        const sources = entity.room.find(FIND_SOURCES);
        if (!sources || sources.length === 0) return null;
        
        if (sources.length === 1) return sources[0].id;
        
        const closest = entity.pos.findClosestByRange(sources);
        if (!closest) return sources[0].id;
        
        const filtered = _.filter(sources, s => s.id !== closest.id);
        if (filtered.length === 0) return closest.id;
        
        const second = entity.pos.findClosestByRange(filtered);
        return second ? second.id : sources[0].id;
      } catch (e) {
        console.log(`Error finding second closest source: ${e}`);
        return null;
      }
    }
  },
  findAvailableSpawnInRoom: function(room) {
    var spawns = room.find(FIND_MY_SPAWNS);
    for (var i in spawns) {
      var spawn = spawns[i];
      if (!spawn.spawning) {
        return spawn;
      }
    }
    return false;
  }
};

// Initialize global helpers
global.helpers = {
  canSpawnCreep: function(spawn, body, name, memory) {
    return spawn.spawnCreep(body, name, { dryRun: true, memory }) === OK;
  },
  spawnCreep: function(spawn, body, name, memory) {
    return spawn.spawnCreep(body, name, { memory });
  },
  getEnergy: function(structure) {
    if (!structure) return 0;
    
    // Check for store API (newer)
    if (structure.store) {
      return structure.store[RESOURCE_ENERGY] || 0;
    }
    // Traditional API
    return structure.energy || 0;
  },
  getEnergyCapacity: function(structure) {
    if (!structure) return 0;
    
    // Check for store API (newer)
    if (structure.store) {
      if (structure.store.getCapacity) {
        return structure.store.getCapacity(RESOURCE_ENERGY) || 0;
      }
      return structure.storeCapacity || 0;
    }
    // Traditional API
    return structure.energyCapacity || 0;
  },
  getBodyCost: function(body) {
    return body.reduce((cost, part) => {
      return cost + BODYPART_COST[part];
    }, 0);
  }
};

// Set up the global controller
global.controller = {
  memory: {
    updateByCreep: (creep: Creep) => {
      // Initialize once per version
      if (!creep.memory.version || creep.memory.version < CONFIG.VERSION) {
        MemoryManager.initCreepMemory(creep, creep.memory.role);
      }
    },
    initCreep: (creep: Creep) => {
      MemoryManager.initCreepMemory(creep, creep.memory.role);
    },
    updateByRoom: (room: Room) => {
      MemoryManager.updateRoomMemory(room);
    },
    initRoom: (room: Room) => {
      MemoryManager.initRoomMemory(room);
    }
  },
  creep: {
    routine: (creep: Creep) => {
      // Run creep based on role
      const role = creep.memory.role;
      switch (role) {
        case 'harvester':
          AI.harvester.task(creep);
          break;
        case 'upgrader':
          AI.upgrader.task(creep);
          break;
        case 'builder':
          AI.builder.task(creep);
          break;
        default:
          AI.harvester.task(creep);
          break;
      }
    }
  },
  room: {
    default: {
      routine: (room: Room) => {
        RoomManager.runRoomLogic(room);
      },
      stage0: (room: Room) => {
        // Stage 0 logic is now in RoomManager
      },
      stage1: (room: Room) => {
        // Stage 1 logic is now in RoomManager
      },
      spawnCreep: (spawn: StructureSpawn, blueprint: any, roomMemory: any) => {
        // This is a compatibility function
        if (!spawn) return false;
        
        const body = blueprint.body;
        const name = blueprint.name || `${blueprint.memory.role}_${Game.time}`;
        const memory = blueprint.memory;
        
        try {
          if (global.helpers && global.helpers.spawnCreep) {
            const result = global.helpers.spawnCreep(spawn, body, name, memory);
            return result === OK;
          } else if (spawn.spawnCreep) {
            const result = spawn.spawnCreep(body, name, { memory });
            return result === OK;
          }
        } catch (e) {
          Logger.error(`Error spawning creep: ${(e as Error).message}`);
        }
        
        return false;
      }
    }
  },
  structure: {
    routine: (structure: Structure) => {
      // This is now handled in StructureManager
      if (structure.structureType === STRUCTURE_TOWER) {
        AI.tower.routine(structure as StructureTower);
      }
    }
  }
};

// Main game loop
export function loop(): void {
  // Log total creeps and breakdown by role
  const creeps = Object.values(Game.creeps);
  const roleCounts: Record<string, number> = {};
  for (const creep of creeps) {
    const role = creep.memory.role || 'unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
  }
  console.log(`[Creeps] Total: ${creeps.length} | Breakdown: ` + Object.entries(roleCounts).map(([role, count]) => `${role}: ${count}`).join(', '));

  Profiler.enable(); // Ensure profiler is enabled every tick
  Logger.info(`GCL: ${Game.gcl.level} (${(Game.gcl.progress / Game.gcl.progressTotal * 100).toFixed(2)}%)`, 'GCL');
  Profiler.start('main');

  try {
    // Initialize logger on first run
    if (!global.loggerInitialized) {
      Logger.init();
      Logger.setupGlobalCommands();
      global.loggerInitialized = true;
    }

    // Log build version on first tick or every 100 ticks
    const currentBuildId = CONFIG.BUILD_ID;

    // Check if this is a new build
    const isNewBuild = !Memory.buildId || Memory.buildId !== currentBuildId;

    if (isNewBuild || !Memory.lastBuildLog || Game.time - Memory.lastBuildLog > 100) {
      const buildTime = new Date().toISOString();

      // If this is a new build, reset all build-related state
      if (isNewBuild) {
        Logger.info(`[WEBPACK-BUILD] 🔶 Screeps-King TypeScript v${require('../package.json').version} running - NEW BUILD DETECTED! Resetting build state - Build ID: ${currentBuildId} - Tick ${Game.time}`);

        // Setup global help command
        // @ts-ignore - adding to global object
        global.help = function() {
          console.log(`
<span style="color: #00ffff; font-weight: bold;">===== SCREEPS-KING HELP =====</span>

<span style="color: #ffff00;">LOGGING COMMANDS:</span>
  - <span style="color: #00ff00;">setLogLevel(level)</span>: Set log level (ERROR=0, WARNING=1, INFO=2, DEBUG=3)
    Example: setLogLevel('DEBUG') or setLogLevel(3)

<span style="color: #ffff00;">STATS COMMANDS:</span>
  - <span style="color: #00ff00;">stats()</span>: Show colony statistics once
  - <span style="color: #00ff00;">stats(true)</span>: Turn on automatic stats every 10 ticks
  - <span style="color: #00ff00;">stats(false)</span>: Turn off automatic stats
  - <span style="color: #00ff00;">Game.time</span>: Show current game tick

<span style="color: #ffff00;">DEBUG COMMANDS:</span>
  - <span style="color: #00ff00;">Game.notify(message)</span>: Send a notification to your email
  - <span style="color: #00ff00;">Game.market.credits</span>: Check your credit balance

<span style="color: #ffff00;">ROOM COMMANDS:</span>
  - <span style="color: #00ff00;">Game.rooms['ROOMNAME'].find(FIND_MY_CREEPS)</span>: Show all your creeps in a room

<span style="color: #ffff00;">MEMORY COMMANDS:</span>
  - <span style="color: #00ff00;">Memory.rooms</span>: Access room memory
  - <span style="color: #00ff00;">Memory.creeps</span>: Access creep memory
  - <span style="color: #00ff00;">Memory.colony</span>: Access colony management memory
          `);
        };

        // Setup global stats command
        // @ts-ignore - adding to global object
        global.stats = function(automatic = null) {
          if (automatic !== null) {
            Memory.enableStats = automatic === true;
            if (automatic) {
              console.log(`<span style="color:#00ff00">Automatic stats display enabled - will show every 10 ticks</span>`);
            } else {
              console.log(`<span style="color:#ffaa00">Automatic stats display disabled</span>`);
            }
          } else {
            // Just show stats once
            StatsDisplay.showStats();
          }
        };

        // Reset build flags and states for all rooms
        for (const roomName in Game.rooms) {
          const room = Game.rooms[roomName];
          if (room.controller && room.controller.my) {
            // Reset room's build queue and construction flags if needed
            if (room.memory.constructionQueue) delete room.memory.constructionQueue;
            if (room.memory.buildFlags) delete room.memory.buildFlags;
            if (room.memory.buildState) delete room.memory.buildState;

            // Force rooms to recalculate stages
            if (room.memory.stage) room.memory.stage = 0;

            // Reset any other build-related memory here
            Logger.info(`[${roomName}] Reset build state for new deployment`);
          }
        }
      } else {
        Logger.info(`[WEBPACK-BUILD] 🔶 Screeps-King TypeScript v${require('../package.json').version} running - Build ID: ${currentBuildId} - Tick ${Game.time}`);
      }

      Memory.buildId = currentBuildId;
      Memory.lastBuildLog = Game.time;
    }
    
    // Initialize managers
    MemoryManager.init();
    TaskManager.init();
    RoomManager.init();
    ColonyManager.init();
    
    // Clean up memory
    if (Game.time % 20 === 0) {
      Profiler.start('memory_cleanup');
      MemoryManager.cleanup();
      Profiler.end('memory_cleanup');
    }
    
    // Update memory
    Profiler.start('memory_update');
    
    // Update creep memory
    _.forEach(Game.creeps, (creep) => {
      try {
        global.controller.memory.updateByCreep(creep);
      } catch (e) {
        Logger.error(`Error updating memory for creep ${creep.name}: ${(e as Error).message}`);
      }
    });
    
    // Update room memory
    _.forEach(Game.rooms, (room) => {
      try {
        global.controller.memory.updateByRoom(room);
      } catch (e) {
        Logger.error(`Error updating memory for room ${room.name}: ${(e as Error).message}`);
      }
    });
    
    Profiler.end('memory_update');
    
    // Process colony (multi-room coordination)
    Profiler.start('colony');
    ColonyManager.run();
    Profiler.end('colony');
    
    // Process creeps
    Profiler.start('creeps');
    CreepManager.runCreeps();
    Profiler.end('creeps');
    
    // Process rooms
    Profiler.start('rooms');
    RoomManager.runRooms();
    Profiler.end('rooms');
    
    // Process structures
    Profiler.start('structures');
    StructureManager.runStructures();
    Profiler.end('structures');
    
    // Process spawning
    Profiler.start('spawning');
    CreepManager.processSpawns();
    Profiler.end('spawning');
    
    // Request scouts occasionally to explore the map
    if (Game.time % 1000 === 0) {
      CreepManager.requestScouts();
    }
    
    // Process tasks
    if (Game.time % 5 === 0) {
      Profiler.start('tasks');
      TaskManager.cleanup();
      Profiler.end('tasks');
    }
    
    // Save tasks to memory
    TaskManager.save();
    
    // Display profiler results
    if (Game.time % 100 === 0) {
      Profiler.report();
    }

    // Display stats every 10 ticks, but not on the same tick as profiler to avoid clutter
    if (Game.time % 10 === 5 && Memory.enableStats) {
      StatsDisplay.showStats();
    }
    
    // Update market trends every 1000 ticks
    MarketTrends.update();
    
  } catch (e) {
    Logger.error(`Critical error in main loop: ${(e as Error).stack || (e as Error).message}`);
  }
  
  Profiler.end('main');
}