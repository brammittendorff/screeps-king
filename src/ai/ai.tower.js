Object.assign(component, {

  tower: {

    /**
     * @see http://support.screeps.com/hc/en-us/articles/203339002-Defending-your-room
     */

    routine: function(entity) {

      var targets = {};
      var room = entity.room;

      /**
       * priority order
       */

      // things to always shoot at
      if (entity.energy > 0) {

        targets = room.find(FIND_HOSTILE_CREEPS);
        if (targets.length) {
          this.attackClosestTarget(entity, targets);
          return;
        }

        // attack enemy military structures //STRUCTURE_TOWER
        targets = room.find(FIND_HOSTILE_STRUCTURES, {
          filter: {structureType: STRUCTURE_TOWER}
        });
        if (targets.length) {
          this.attackClosestTarget(entity, targets);
          return;
        }

      }

      if (entity.energy > entity.energyCapacity / 4) {

        // attack hostile construction sites //FIND_HOSTILE_CONSTRUCTION_SITES
        targets = room.find(FIND_HOSTILE_CONSTRUCTION_SITES);
        if (targets.length) {
          this.attackClosestTarget(entity, targets);
          return;
        }

      }

      if (entity.energy > entity.energyCapacity / 2) {

        // attack enemy primary structures //STRUCTURE_TOWER
        targets = room.find(FIND_HOSTILE_SPAWNS);
        if (targets.length) {
          this.attackClosestTarget(entity, targets);
          return;
        }

        // attack enemy //FIND_HOSTILE_STRUCTURES
        targets = room.find(FIND_HOSTILE_STRUCTURES);
        if (targets.length) {
          this.attackClosestTarget(entity, targets);
        }

        targets = room.find(FIND_MY_STRUCTURES, {
          filter: function(structure) {
            return structure.structureType == STRUCTURE_TOWER && structure.hitsMax > structure.hits;
          }
        });
        if (targets.length) {
          this.repairClosestTarget(entity, targets);
          return;
        }

      }

      if (entity.energy > ((entity.energyCapacity / 4) * 3)) {


        // heal friendly non-military creeps
        targets = room.find(FIND_MY_CREEPS, {
          filter: function(creep) {
            return creep.hitsMax > creep.hits;
          }
        });
        if (targets.length) {
          this.healClosestTarget(entity, targets);
          return;
        }

        // repair friendly buildings
        targets = room.find(FIND_MY_STRUCTURES, {
          filter: function(structure) {
            return structure.hitsMax > structure.hits;
          }
        });
        if (targets.length) {
          this.repairClosestTarget(entity, targets);
          return;
        }

        // repair rampart
        targets = room.find(FIND_STRUCTURES, {
          filter: function(structure) {
            return structure.structureType == STRUCTURE_RAMPART && structure.hitsMax > structure.hits;
          }
        });
        if (targets.length) {
          this.repairClosestTarget(entity, targets);
          return;
        }

        // repair roads
        targets = room.find(FIND_STRUCTURES, {
          filter: function(structure) {
            return structure.structureType == STRUCTURE_ROAD && structure.hitsMax > structure.hits;
          }
        });
        if (targets.length) {
          this.repairClosestTarget(entity, targets);
          return;
        }

        // repair wall
        targets = room.find(FIND_STRUCTURES, {
          filter: function(structure) {
            return structure.structureType == STRUCTURE_WALL && structure.hitsMax > structure.hits;
          }
        });
        if (targets.length) {
          this.repairClosestTarget(entity, targets);
          return;
        }

      }

    },

    attackClosestTarget: function(entity, targets) {
      var target = entity.pos.findClosestByRange(targets);
      //console.log('attacking: ' + JSON.stringify(target));
      var attackCode = entity.rangedAttack(target);
      if(attackCode != 0) {
        console.log('Attacking failed, for unknown reason with code: ' + attackCode);
        entity.attack(target);
      }
    },

    healClosestTarget: function(entity, targets) {
      var target = entity.pos.findClosestByRange(targets);
      //console.log('healing: ' + JSON.stringify(target));
      var healCode = entity.heal(target);
      if (healCode != 0) {
        console.log('Repairing failed, for unknown reason with code: ' + healCode);
      }
    },

    repairClosestTarget: function(entity, targets) {
      var target = targets[0];
      //console.log('repairing: ' + JSON.stringify(target));
      var repairCode = entity.repair(target);
      if (repairCode != 0) {
        console.log('Repairing failed, for unknown reason with code: ' + repairCode);
      }
    }

  }

});
