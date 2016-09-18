var go = require('process.go');
var resourceSelector = require('select.resource');

module.exports = {

  execute: function(room) {

    /**
     * Every tick
     */

    // task creeps
    var creeps = room.find(FIND_MY_CREEPS);
    go.taskCreepsByTheirRoles(creeps);

    // task towers
    var towers = room.find(FIND_MY_STRUCTURES, {filter:
            function(structure) {
              return structure.structureType == STRUCTURE_TOWER;
            }
        });
    try {
      var towerTasker = require('structure.tower');
    } catch (e) {
      // Unable to load tower routine
    }
    if (towerTasker) {
      for (i in towers) {
        towerTasker.routine(towers[i]);
      }
    }

    /**
     * Conditional proceedings
     *
     * SET STAGE
     */

    if (!room.memory.stage) {
      room.memory.stage = 0;
    }

    /**
     * STAGE 0: Build initial creeps
     */

    if (room.memory.stage == 0) {

      // advance to next room?
      if (room.energyCapacityAvailable >= 550) {
        room.memory.stage = 1;
        return;
      }

      // check if enough energy
      if (room.energyAvailable < 300) {
        return;
      }

      // create first <amount> harvesters
      var amount = 3; // no more than spaces for resource closest tot spawn
      if (room.harvesters < amount) {
        var bp = require('z.300harvester');
        var spawn = go.findAvailableSpawnInRoom(room);
        if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
          spawn.createCreep(bp.body, bp.name, bp.memory);
          return;
        }
        return;
      }

      // create first <amount> upgraders
      amount = 5;
      if (room.upgraders < amount) {
        var bp = require('z.300upgrader');
        var spawn = go.findAvailableSpawnInRoom(room);
        if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
          spawn.createCreep(bp.body, bp.name, bp.memory);
          return;
        }
        return;
      }

    }

    /**
     * STAGE 1: Build larger creeps
     */

    if (room.memory.stage == 1) {

      if (room.energyAvailable < 550) {
        return;
      }

      // create <amount> bigger harvesters
      var amount = 4; // no more than spaces for resource closest tot spawn
      if (room.harvesters < amount) {
        if (room.energyCapacityAvailable >= 800) {
          if (room.energyAvailable < 800) {
            return;
          }
          var bp = require('z.800harvester');
        } else {
          var bp = require('z.550harvester');
        }
        var spawn = go.findAvailableSpawnInRoom(room);
        if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
          spawn.createCreep(bp.body, bp.name, bp.memory);
          return;
        }
        return;
      }

      // create <amount> bigger upgraders
      amount = 5;
      if (room.upgraders < amount) {
        if (room.energyCapacityAvailable >= 800) {
          if (room.energyAvailable < 800) {
            return;
          }
          var bp = require('z.800upgrader');
        } else {
          var bp = require('z.550upgrader');
        }
        var spawn = go.findAvailableSpawnInRoom(room);
        if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
          spawn.createCreep(bp.body, bp.name, bp.memory);
          return;
        }
        return;
      }

      return;

    }

  }

};
