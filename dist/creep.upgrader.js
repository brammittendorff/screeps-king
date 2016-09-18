var resourceSelector = require('select.resource');

module.exports = {

  /** @param {Creep} creep **/
  task: function(creep) {
    var cMemory = creep.memory;

    // initiate
    if (!cMemory.initiated) {
      cMemory.activity = 'harvesting';
      cMemory.targetSourceId = resourceSelector.selectClosestTo(creep);
      cMemory.initiated = true;
      creep.say('++RCL;');
    }

    // When full, change this creeps harvesting spot and switch to upgrading
    if (cMemory.activity == 'harvesting') {
      this.harvest(creep);
    }

    // When done upgrading, switch to harvesting
    if (cMemory.activity == 'upgrading') {
      this.upgrade(creep);
    }

  },

  harvest: function(creep) {
    var cMemory = creep.memory;

    if (creep.carryCapacity > creep.carry.energy) {
      var targetSource = Game.getObjectById(cMemory.targetSourceId);
      if (creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
        creep.moveTo(targetSource);
      }
    } else {
      cMemory.activity = 'upgrading';
      creep.say('Upgrading!');
      this.upgrade(creep);
    }

  },

  upgrade: function(creep) {
    var cMemory = creep.memory;
    var controller = creep.room.controller;
    if (creep.carry.energy != 0) {
      if (creep.upgradeController(controller) == ERR_NOT_IN_RANGE) {
        creep.moveTo(controller, {});
      }
    } else {
      cMemory.activity = 'harvesting';
      creep.say('Crystals!');
      this.harvest(creep);
    }
  }

};
