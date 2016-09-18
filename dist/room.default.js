var go = require('process.go');

ai = require('ai');
global.templates = require('templates');
global.resourceSelector = require('select.resource');

module.exports = {

  execute: function(room) {

    /**
     * Every tick
     */

    //vars
    var i;
    var ai;
    var rMemory = room.memory;

    // task creeps
    var creeps = room.find(FIND_MY_CREEPS);
    for (i in creeps) {
      var creep = creeps[i];
      var cMemory = creep.memory;
      if (cMemory.role === undefined) {
        cMemory.role = creep.memory.role = 'harvester';
      }
      if(ai[cMemory.role]) {
        ai[cMemory.role].task(creep);
      }
    }

    // task towers
    var towers = room.find(FIND_MY_STRUCTURES, {
      filter: function(structure) {
        return structure.structureType == STRUCTURE_TOWER;
      }
    });
    for (i in towers) {
      ai.tower.routine(towers[i]);
    }

    /**
     * Conditional proceedings
     *
     * SET STAGE
     */

    if (!rMemory.stage) {
      rMemory.stage = room.memory.stage = 0;
    }

    /**
     * STAGE 0: Build initial creeps
     */

    if (rMemory.stage == 0) {
      this.stage0(room, rMemory);
      return;
    }

    /**
     * STAGE 1: Build larger creeps
     */

    if (rMemory.stage == 1) {
      this.stage1(room);
      return;
    }

  },

  stage0: function(room, rMemory) {

    // advance to next room?
    if (room.energyCapacityAvailable >= 550) {
      rMemory.stage = room.memory.stage = 1;
      this.stage1(room);
    }

    // check if enough energy
    if (room.energyAvailable < 300) {
      return;
    }

    // create first <amount> harvesters
    var amount = 3; // no more than spaces for resource closest tot spawn
    if (room.harvesters < amount) {
      var bp = global.templates['_300harvester'];
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
      bp = global.templates['_300upgrader'];
      spawn = go.findAvailableSpawnInRoom(room);
      if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
        spawn.createCreep(bp.body, bp.name, bp.memory);
        return;
      }
      return;
    }

  },

  stage1: function(room) {
    if (room.energyAvailable < 550) {
      return;
    }

    // create <amount> bigger harvesters
    var amount = 4; // no more than spaces for resource closest tot spawn
    var bp;
    var spawn;
    if (room.harvesters < amount) {
      if (room.energyCapacityAvailable >= 800) {
        if (room.energyAvailable < 800) {
          return;
        }
        bp = global.templates['_800harvester'];
      } else {
        bp = global.templates['_550harvester'];
      }
      spawn = go.findAvailableSpawnInRoom(room);
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
        bp = global.templates['_800upgrader'];
      } else {
        bp = global.templates['_550upgrader'];
      }
      spawn = go.findAvailableSpawnInRoom(room);
      if (spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
        spawn.createCreep(bp.body, bp.name, bp.memory);
        return;
      }
      return;
    }

  }

};
