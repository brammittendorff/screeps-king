var resourceSelector = require('select.resource');

module.exports = {

  /** @param {Creep} creep **/
  task: function(creep) {

    //vars
    var buildingTemplate = require('build.' + creep.room.template);
    var cMemory = creep.memory;

    // initiate
    if (!cMemory.initiated) {
      cMemory.activity = 'harvesting';
      cMemory.targetSourceId = resourceSelector.selectClosestTo(creep);
      cMemory.initiated = true;
      creep.say('Work Work!');
    }

    // When full, change this creeps harvesting spot and switch to upgrading
    if (cMemory.activity == 'harvesting') {
      if (creep.carryCapacity != creep.carry.energy) {
        var targetSource = Game.getObjectById(cMemory.targetSourceId);
        if (creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
          creep.moveTo(targetSource);
          return;
        }
      } else {
        cMemory.activity = 'unloading';
        creep.say('Unloading!');
      }
    }

    // When done upgrading, switch to harvesting
    if (cMemory.activity == 'unloading') {
      // when not empty, transfer energy to target
      if (creep.carry.energy != 0) {

        // priority order
        var sPriority = [
            STRUCTURE_TOWER,
            STRUCTURE_EXTENSION,
            STRUCTURE_SPAWN
        ];

        var targets = [];
        for (i in sPriority) {
          var targetsOfOneType = creep.room.find(FIND_MY_STRUCTURES, {
            filter: function(s) {
              return (s.energy < s.energyCapacity) && (s.sType == sPriority[i]);
            }
          });
          for (j in targetsOfOneType) {
            targets.push(targetsOfOneType[j]);
          }
        }

        if (targets.length > 0) {
          if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
            creep.moveTo(targets[0]);
            return;
          }
        } else {
          cMemory.activity = 'building';
          //creep.say('Work Work!');
        }
      } else {
        cMemory.activity = 'harvesting';
        creep.say('Need moarr!');
      }
    }

    // when energy is full, switch to building/repairing
    if (cMemory.activity == 'building') {
      // when not empty, start building/repairing
      if (creep.carry.energy != 0) {
        // what was i doing exactly?
        if (!cMemory.buildMode) {
          cMemory.buildMode = _.random(1,2); // 1 = build, 2 = repair
          switch (cMemory.buildMode) {
            case 1:  creep.say('Build!'); break;
            case 2:  creep.say('Repair!'); break;
            default: creep.say('Huh?!'); break;
          }
        }
        // build
        if (cMemory.buildMode == 1) {
          var targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
          if (targets.length > 0) {
            if (creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
              creep.moveTo(targets[0]);
              return;
            }
          } else {
            // create new building if needed
            buildingTemplate.build(creep.room);

            //if(creep.carry.energy < creep.carryCapacity) {
            cMemory.activity = 'harvesting';
            //}

          }
        }
        // repair
        if (cMemory.buildMode == 2) {
          var targets = creep.room.find(FIND_MY_STRUCTURES, {
            filter: function(s) {
              return (s.hits < s.hitsMax);
            }
          });
          if (targets.length > 0) {
            if (creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
              creep.moveTo(targets[0]);
              return;
            }
          } else {
            // nothing to repair, back to buildmode
            creep.say('Build.');
            cMemory.buildMode = 1;
          }
        }
      } else {
        cMemory.buildMode = false;
        cMemory.activity = 'harvesting';
        creep.say('Need moarr!');
      }
    }

  }

};
