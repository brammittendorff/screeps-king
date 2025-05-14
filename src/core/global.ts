import { CONFIG } from '../configuration';
import { Logger } from '../utils/logger';
import { MemoryManager } from '../management/memory-manager';
import { AI } from '../roles';
import * as _ from 'lodash';

export function globalInit() {
  // Initialize global objects to maintain compatibility with the old code
  global.ai = AI as any;
  global.config = {
    version: CONFIG.VERSION,
    BUILD_ID: CONFIG.BUILD_ID
  };

  // Initialize global.go and resource functions to prevent undefined errors
  global.go = {
    resource: require('../utils/helpers/resource').resourceHelpers,
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
  global.helpers = require('../utils/helpers/creep').creepHelpers;

  // Set up the global controller
  global.controller = require('../control/globalController').globalController;

  // Add help command
  global.help = function() {
    console.log(`
=== Screeps-King Help ===
Available commands:

Game Management:
- help(): Show this help message
- Game.rooms[roomName].memory.emergency = true/false: Toggle emergency mode for a room

Creep Management:
- Game.creeps[name].memory.role = 'harvester': Change a creep's role
- _.filter(Game.creeps, c => c.memory.role === 'harvester'): List creeps by role

Spawning:
- CreepManager.requestCreep({...}): Request a creep to be spawned
- Game.spawns['Spawn1'].spawnCreep([WORK,CARRY,MOVE], 'name'): Spawn a creep directly

Room Planning:
- RoomMapper.planRoom(Game.rooms['roomName']): Plan room layout
- Memory.colony.rooms.owned.push('roomName'): Register a room as owned

Memory Management:
- global.resetMemory(): Reset memory (use with caution!)
- delete Memory.creeps[deadCreepName]: Clean up dead creep memory

Statistics and Monitoring:
- StatsDisplay.showRoomStats(Game.rooms['roomName']): Show room statistics
- Memory.stats.lastReset = Game.time: Reset stats collection
`);
    return 'Help displayed in console. Type help() for this message again.';
  };
} 