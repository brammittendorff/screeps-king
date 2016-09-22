Object.assign(component, {

  room: {

    'default': {

      routine: function (room) {

        /**
         * Every tick
         */

          //vars
        var i;
        var rMemory = room.memory;

        // todo: clean up this stuff, put in controller.tower or controller.buildings.tower
        // task towers
        var towers = room.find(FIND_MY_STRUCTURES, {
          filter: function (structure) {
            return structure.structureType == STRUCTURE_TOWER;
          },
        });
        for (i in towers) {
          global.ai.tower.routine(towers[i]);
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
          this.stage0(room);
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

      stage0: function (room) {

        var rMemory = room.memory;

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
        var bp;
        var spawn;
        if (room.memory.harvesters < amount) {
          bp = global.templates._300harvester;
          spawn = global.go.findAvailableSpawnInRoom(room);
          if (spawn && spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
            spawn.createCreep(bp.body, bp.name, bp.memory);
            return;
          }

          return;
        }

        // create first <amount> upgraders
        amount = 5;
        if (room.memory.upgraders < amount) {
          bp = global.templates._300upgrader;
          spawn = global.go.findAvailableSpawnInRoom(room);
          if (spawn && spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
            spawn.createCreep(bp.body, bp.name, bp.memory);
            return;
          }

          return;
        }

      },

      stage1: function (room) {

        if (room.energyAvailable < 300) {
          return;
        }

        // create <amount> bigger harvesters
        var amount = 4; // no more than spaces for resource closest tot spawn
        var bp;
        var spawn;
        //console.log(JSON.stringify(room.memory));
        if (room.memory.harvesters < amount) {
          if (room.memory.harvesters < 1) {
            // todo: remove this failover using a better function
            bp = global.templates._300harvester;
            spawn = global.go.findAvailableSpawnInRoom(room);

            if (spawn && spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
              spawn.createCreep(bp.body, bp.name, bp.memory);
              return;
            }
          } else if (room.energyCapacityAvailable >= 800) {
            if (room.energyAvailable < 800) {
              return;
            }
            bp = global.templates._800harvester;
          } else {
            bp = global.templates._550harvester;
          }

          spawn = global.go.findAvailableSpawnInRoom(room);
          if (spawn && spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
            spawn.createCreep(bp.body, bp.name, bp.memory);
            return;
          }

          return;
        }

        // create <amount> bigger upgraders
        amount = 5;
        if (room.memory.upgraders < amount) {
          if (room.energyCapacityAvailable >= 1300) {
            if (room.energyAvailable < 1300) {
              return;
            }
            bp = global.templates._1300upgrader;
          } else if (room.energyCapacityAvailable >= 800) {
            if (room.energyAvailable < 800) {
              return;
            }
            bp = global.templates._800upgrader;
          } else {
            bp = global.templates._550upgrader;
          }

          spawn = global.go.findAvailableSpawnInRoom(room);
          if (spawn && spawn.canCreateCreep(bp.body, bp.name, bp.memory) == 0) {
            spawn.createCreep(bp.body, bp.name, bp.memory);
            return;
          }

          return;
        }

      },

    },

  },

});
