Object.assign(component, {

  memory: {

    updateByCreep: function (creep) {

      // if new creep or new code version, (re)initialize
      if( !creep.memory.version || creep.memory.version < global.config.version ) {
        this.initCreep(creep);
      }

      // every tick

    },

    initCreep: function (creep) {

      creep.memory.version = global.config.version;

    },

    updateByRoom: function (room) {

      // if new room or new code version, (re)initialize
      if( !room.memory.version || room.memory.version < global.config.version ) {
        this.initRoom(room);
      }

      // every tick

    },

    initRoom: function (room) {

      room.memory.version = global.config.version;

      // todo: clean this stuff up
      var foundCreeps = room.find(FIND_MY_CREEPS);
      var foundStructures = room.find(FIND_MY_STRUCTURES);
      var foundSpawns = room.find(FIND_MY_SPAWNS);
      var foundConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);

      // definitions that are needed for all rooms
      // count entities, save to object & memory.
      room.harvesters = _(foundCreeps).filter({
        memory: {
          role: 'harvester',
        },
      }).size();
      room.memory.harvesters = room.harvesters;

      room.upgraders = _(foundCreeps).filter({
        memory: {
          role: 'upgrader',
        },
      }).size();
      room.memory.upgraders = room.upgraders;

      room.builders = _(foundCreeps).filter({
        memory: {
          role: 'builder',
        },
      }).size();
      room.memory.builders = room.builders;

      room.structures = _(foundStructures).size();
      room.memory.structures = room.structures;

      room.spawns = _(foundSpawns).size();
      room.memory.spawns = room.spawns;

      room.constructions = _(foundConstructionSites).size();
      room.memory.constructions = room.constructions;

      // set template according to rooms memory
      if (!room.memory.template) {
        room.template = room.memory.template = 'default';
      } else {
        room.template = room.memory.template;
      }

    }

  }

});