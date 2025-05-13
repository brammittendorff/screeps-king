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
} 