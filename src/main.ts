/**
 * Main game loop
 * Entry point for the Screeps game engine
 * Enhanced with multi-room colony management
 */

import { CONFIG } from './config';
import { Logger } from './utils/logger';
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
import { RoomCache } from './utils/room-cache';
import { globalInit } from './global';

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
      // Run creep based on role using modular AI
      const role = creep.memory.role;
      if (role && AI[role] && typeof AI[role].task === 'function') {
        AI[role].task(creep);
      } else {
        // Fallback to harvester if role is missing or not implemented
        AI.harvester.task(creep);
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

// Utility: Safe get/set for nested memory
function getOrCreate<T>(obj: any, key: string, def: T): T {
  if (!obj[key]) obj[key] = def;
  return obj[key];
}

// Main game loop
export function loop(): void {
  globalInit();
  RoomCache.clear();
  delete global.RoomCache;

  // Only update all creeps' memory if config version changed (on new build)
  if (!Memory.lastCreepMemoryUpdateVersion || Memory.lastCreepMemoryUpdateVersion !== CONFIG.VERSION) {
    MemoryManager.updateAllCreepMemory();
    Memory.lastCreepMemoryUpdateVersion = CONFIG.VERSION;
    console.log(`[MemoryManager] Updated all creep memory for new config version: ${CONFIG.VERSION}`);
    // Clean up old/orphaned creep memory
    for (const name in Memory.creeps) {
      if (!Game.creeps[name]) {
        delete Memory.creeps[name];
      }
    }
    console.log('[MemoryManager] Cleaned up orphaned creep memory after deploy.');
  }

  // Only call cleanup on managers that have it
  if (Game.time % 20 === 0) {
    try { MemoryManager.cleanup(); } catch (e) { Logger.error(`Error in MemoryManager.cleanup: ${(e as Error).stack || (e as Error).message}`); }
    try { TaskManager.cleanup(); } catch (e) { Logger.error(`Error in TaskManager.cleanup: ${(e as Error).stack || (e as Error).message}`); }
    try { ColonyManager.cleanup(); } catch (e) { Logger.error(`Error in ColonyManager.cleanup: ${(e as Error).stack || (e as Error).message}`); }
    try { StructureManager.cleanup(); } catch (e) { Logger.error(`Error in StructureManager.cleanup: ${(e as Error).stack || (e as Error).message}`); }
    try { RoomManager.cleanup(); } catch (e) { Logger.error(`Error in RoomManager.cleanup: ${(e as Error).stack || (e as Error).message}`); }
  }
  // Only run heavy cleanup every 20 ticks
  if (Game.time % 20 === 0) {
    MemoryManager.cleanup();
    if (global.TaskManager && typeof global.TaskManager.cleanup === 'function') global.TaskManager.cleanup();
    if (global.StructureManager && typeof global.StructureManager.cleanup === 'function') global.StructureManager.cleanup();
    if (global.ColonyManager && typeof global.ColonyManager.cleanup === 'function') global.ColonyManager.cleanup();
  }
  // Log comprehensive stats and build planning every 100 ticks or if forced
  if (Game.time % 100 === 0 || Memory.forceStatsLog) {
    // GCL
    const gcl = Game.gcl;
    // CPU
    const cpu = Game.cpu;
    // Memory
    const memSize = RawMemory.get().length / 1024;
    // Creep stats
    const creeps = Object.values(Game.creeps);
    const roleCounts = _.countBy(creeps, c => c.memory.role || 'unknown');
    // Room stats
    const ownedRooms = Object.values(Game.rooms).filter(r => r.controller && r.controller.my);
    const roomStats = ownedRooms.map(r => {
      const rcl = r.controller.level;
      const rclPct = (r.controller.progress / r.controller.progressTotal * 100).toFixed(1);
      const energy = r.energyAvailable;
      const energyCap = r.energyCapacityAvailable;
      const storage = r.storage ? r.storage.store[RESOURCE_ENERGY] : 0;
      // Build planning
      const buildQueue = r.memory.constructionQueue || [];
      const nextBuilds = _.countBy(buildQueue, b => b.structureType);
      const sites = r.find(FIND_MY_CONSTRUCTION_SITES);
      const siteTypes = _.countBy(sites, s => s.structureType);
      // Critical missing structures
      const missing: string[] = [];
      if (rcl >= 4 && !r.storage) missing.push('Storage');
      if (rcl >= 6 && !r.terminal) missing.push('Terminal');
      if (rcl >= 2 && r.find(FIND_MY_STRUCTURES, { filter: s => s.structureType === STRUCTURE_TOWER }).length === 0) missing.push('Tower');
      // Detailed build queue log
      let buildQueueLog = '';
      if (buildQueue.length) {
        buildQueueLog = '\n  Build Queue:' + buildQueue.map((b: any, i: number) => {
          const pos = b.pos ? `(${b.pos.x},${b.pos.y})` : '';
          const tag = b.tag ? ` [${b.tag}]` : '';
          return `\n    ${i + 1}. ${b.structureType}${pos}${tag}`;
        }).join('');
      }
      return `[${r.name}] RCL${rcl} (${rclPct}%) | E: ${energy}/${energyCap} | Storage: ${storage} | Sites: ${sites.length} (${Object.entries(siteTypes).map(([type, n]) => `${type}:${n}`).join(', ')}) | Next: ${Object.entries(nextBuilds).map(([type, n]) => `${type}:${n}`).join(', ')}${missing.length ? ' | Missing: ' + missing.join(', ') : ''}${buildQueueLog}`;
    }).join(' | ');
    // Construction site limit
    const totalSites = Object.values(Game.rooms).reduce((sum, r) => sum + r.find(FIND_MY_CONSTRUCTION_SITES).length, 0);
    // Market
    const credits = Game.market ? Game.market.credits : 0;

    // TaskManager: log all active tasks
    const allTasks = (global.TaskManager && global.TaskManager['tasks']) ? Object.values(global.TaskManager['tasks']) as import('./managers/task-manager').Task[] : [];
    const taskTypeCounts: Record<string, number> = {};
    for (const t of allTasks) {
      taskTypeCounts[t.type] = (taskTypeCounts[t.type] || 0) + 1;
    }
    console.log(`[STATS] Tasks: ${allTasks.length} (${Object.entries(taskTypeCounts).map(([type, n]) => `${type}:${n}`).join(', ')})`);
    if (allTasks.length > 0) {
      for (const t of allTasks) {
        const age = Game.time - t.createdAt;
        console.log(`  - [${t.type}] Target: ${t.targetId} | Room: ${t.roomName} | Assigned: ${t.assignedCreeps?.join(',') || '-'} | Priority: ${t.priority} | Age: ${age}`);
      }
    }

    console.log(`[STATS] GCL:${gcl.level} (${(gcl.progress / gcl.progressTotal * 100).toFixed(2)}%) | CPU: ${cpu.getUsed().toFixed(1)}/${cpu.limit}, Bucket: ${cpu.bucket} | Mem: ${memSize.toFixed(1)}KB`);
    console.log(`[STATS] Creeps: ${creeps.length} (${Object.entries(roleCounts).map(([role, n]) => `${role}:${n}`).join(', ')})`);
    console.log(`[STATS] Rooms: Owned: ${ownedRooms.length}`);
    console.log(roomStats);
    console.log(`[STATS] Construction sites: ${totalSites}/100 | Market: ${credits} credits`);
  }
  // Emergency low-CPU mode: skip non-essential logic if bucket is low
  if (Game.cpu.bucket < 1000) {
    // Only run essential creep and room logic
    for (const name in Game.creeps) {
      const creep = Game.creeps[name];
      // Only process 1/3 of creeps per tick (same batching as CreepManager)
      if (Game.time % 3 !== (parseInt(creep.name.replace(/\D/g, ''), 10) % 3)) continue;
      try {
        const role = creep.memory.role;
        if (role && AI[role] && typeof AI[role].task === 'function') {
          AI[role].task(creep);
        } else {
          AI.harvester.task(creep);
        }
      } catch (e) {
        // Ignore errors in emergency mode
      }
    }
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      if (room.controller && room.controller.my) {
        try {
          RoomManager.runRoomLogic(room);
        } catch (e) {
          // Ignore errors in emergency mode
        }
      }
    }
    // Skip all other logic
    return;
  }

  // Per-tick heartbeat log
  const isStatsTick = Game.time % 100 === 0 || Memory.forceStatsLog;
  const gcl = Game.gcl;
  const creeps = Object.values(Game.creeps);
  const cpu = Game.cpu;
  const memSize = RawMemory.get().length / 1024;
  const tickMark = isStatsTick ? '*' : '';
  const ticksToNextStats = isStatsTick ? 'NOW' : (100 - (Game.time % 100));
  
  console.log(`[TICK ${Game.time}${tickMark}] GCL: ${gcl.level} (${(gcl.progress / gcl.progressTotal * 100).toFixed(2)}%) | Creeps: ${creeps.length} | CPU: ${cpu.getUsed().toFixed(1)}/${cpu.limit} | Mem: ${memSize.toFixed(0)}KB | NextStats: ${ticksToNextStats}`);

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
        Logger.info(`[WEBPACK-BUILD] 🔶 Screeps-King TypeScript v${CONFIG.VERSION} running - NEW BUILD DETECTED! Resetting build state - Build ID: ${currentBuildId} - Tick ${Game.time}`);

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
        Logger.info(`[WEBPACK-BUILD] 🔶 Screeps-King TypeScript v${CONFIG.VERSION} running - Build ID: ${currentBuildId} - Tick ${Game.time}`);
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
      MemoryManager.cleanup();
    }
    
    // Update memory
    
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
    
    // Process colony (multi-room coordination)
    ColonyManager.run();
    
    // Process creeps
    CreepManager.runCreeps();
    
    // Process rooms
    RoomManager.runRooms();
    
    // Process structures
    StructureManager.runStructures();
    
    // Process spawning
    CreepManager.processSpawns();
    
    // Request scouts occasionally to explore the map
    if (Game.time % 1000 === 0) {
      CreepManager.requestScouts();
    }
    
    // Process tasks
    if (Game.time % 5 === 0) {
      TaskManager.cleanup();
    }
    
    // Save tasks to memory
    TaskManager.save();
    
    // Display stats every 10 ticks, but not on the same tick as profiler to avoid clutter
    if (Game.time % 10 === 5 && Memory.enableStats) {
      StatsDisplay.showStats();
    }
    
    // Update market trends every 1000 ticks
    MarketTrends.update();
    
    // Log task analytics every 500 ticks (was 100)
    if (Game.time % 500 === 0) {
      TaskManager.logAnalytics();
    }
    
    // Keep only the last 20 most recently seen scouted rooms, robust and type-safe
    try {
      const colony = getOrCreate(Memory, 'colony', {});
      const rooms = getOrCreate(colony, 'rooms', {});
      // Type assertion for scouted
      const scouted = getOrCreate(rooms, 'scouted', {}) as Record<string, { lastSeen: number }>;
      const validEntries = Object.entries(scouted)
        .filter(([room, data]) =>
          typeof room === 'string' &&
          data && typeof (data as any).lastSeen === 'number'
        )
        .sort((a, b) => (b[1] as any).lastSeen - (a[1] as any).lastSeen);
      (rooms as any).scouted = Object.fromEntries(validEntries.slice(0, 20));
    } catch (e) {
      Logger.error(`Error pruning scouted rooms: ${(e as Error).stack || (e as Error).message}`);
    }
    
  } catch (e) {
    Logger.error(`Critical error in main loop: ${(e as Error).stack || (e as Error).message}`);
  }
}