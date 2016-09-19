Object.assign(component, {

  harvester: {

    task: function (creep) {

      //vars
      var buildingTemplate = require('build.' + creep.room.template);
      var cMemory = creep.memory;

      // initiate
      if (!cMemory.initiated) {
        cMemory.activity = 'harvesting';
        cMemory.targetSourceId = global.resourceSelector.selectClosestTo(creep);
        cMemory.initiated = true;
        this.saveState(creep, cMemory);
        creep.say('Work Work!');
      }

      // When full, change this creeps harvesting spot and switch to upgrading
      if (cMemory.activity == 'harvesting') {
        if (creep.carryCapacity != creep.carry.energy) {
          var targetSource = Game.getObjectById(cMemory.targetSourceId);
          if (creep.harvest(targetSource) == ERR_NOT_IN_RANGE) {
            creep.moveTo(targetSource);
            this.saveState(creep, cMemory);
            return;
          }
        } else {
          cMemory.activity = 'unloading';
          this.saveState(creep, cMemory);
          creep.say('Unloading!');
        }
      }

      // When done upgrading, switch to harvesting
      var targets = [];
      if (cMemory.activity == 'unloading') {
        // when not empty, transfer energy to target
        if (creep.carry.energy != 0) {

          // priority order (temp tower to bottom, until better processing)
          var structuresPriority = [
            STRUCTURE_EXTENSION,
            STRUCTURE_SPAWN,
            STRUCTURE_TOWER
          ];

          var i;
          var j;
          for (i in structuresPriority) {
            var targetsOfOneType = creep.room.find(FIND_MY_STRUCTURES, {
              filter: function (structure) {
                return (structure.energy < structure.energyCapacity) &&
                  (structure.structureType == structuresPriority[i]);
              },
            });
            for (j in targetsOfOneType) {
              targets.push(targetsOfOneType[j]);
            }
          }

          if (targets.length > 0) {
            if (creep.transfer(targets[0], RESOURCE_ENERGY) == ERR_NOT_IN_RANGE) {
              creep.moveTo(targets[0]);
              this.saveState(creep, cMemory);
              return;
            }
          } else {
            cMemory.activity = 'building';
            creep.say('Lok\'tar!');
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
            cMemory.buildMode = creep.memory.buildMode = _.random(1, 2); // 1 = build, 2 = repair
            switch (cMemory.buildMode) {
            case 1:
              creep.say('Build!');
              break;
            case 2:
              creep.say('Repair!');
              break;
            default:
              creep.say('Huh?!');
              break;
            }
          }

          // build
          if (cMemory.buildMode == 1) {
            targets = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
            if (targets.length > 0) {
              if (creep.build(targets[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0]);
                this.saveState(creep, cMemory);
                return;
              }
            } else {
              // create new building if needed
              buildingTemplate.build(creep.room);
              cMemory.activity = creep.memory.activity = 'harvesting';
            }
          }

          // repair
          if (cMemory.buildMode == 2) {
            targets = creep.room.find(FIND_MY_STRUCTURES, {
              filter: function (structure) {
                return (structure.hits < structure.hitsMax);
              },
            });
            if (targets.length) {
              if (creep.repair(targets[0]) == ERR_NOT_IN_RANGE) {
                creep.moveTo(targets[0]);
                this.saveState(creep, cMemory);
                return;
              }
            } else {
              // nothing to repair, back to buildmode
              creep.say('Build.');
              cMemory.buildMode = creep.memory.buildMode = 1;
            }
          }
        } else {
          cMemory.buildMode = creep.memory.buildMode = false;
          cMemory.activity = creep.memory.activity = 'harvesting';
          creep.say('Need moarr!');
        }
      }

      this.saveState(creep, cMemory);
    },

    saveState: function (creep, cMemory) {
      // save the object that we just used this tick
      creep.memory = cMemory;
    },

  },

});
