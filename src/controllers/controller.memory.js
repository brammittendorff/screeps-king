Object.assign(component, {

  memory: {

    updateByCreep: function (creep) {
      // initialize once
      if( !creep.memory.version || creep.memory.version < global.config.version ) {
        this.initCreep(creep);
      }

      // update memory for this creep
    },

    initCreep: function (creep) {
      creep.memory.version = global.config.version;
    },

    updateByRoom: function (room) {

      var rMemory  = room.memory;

      // initialize once
      if (!rMemory.version || rMemory.version < global.config.version) {
        this.initRoom(room);
      }

      // per tick
      rMemory.ticks += 1;

      // even ticks - Creeps
      if(!(rMemory.ticks & 1)) {
        let myCreeps            = room.find(FIND_MY_CREEPS);
        rMemory.harvesters      = _(myCreeps).filter({ memory: { role: 'harvester' } }).size();
        rMemory.upgraders       = _(myCreeps).filter({ memory: { role: 'upgrader'  } }).size();
        rMemory.hostiles        = room.find(FIND_HOSTILE_CREEPS);
        rMemory.hostilesCount   = _(rMemory.hostiles).size();
      }

      // odd ticks - Buildings
      if(rMemory.ticks & 1) {
        let myStructures        = room.find(FIND_MY_STRUCTURES);
        let mySpawns            = room.find(FIND_MY_SPAWNS);
        let myConstructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
        rMemory.structures      = _(myStructures).size();
        rMemory.spawns          = _(mySpawns).size();
        rMemory.constructions   = _(myConstructionSites).size();
      }

      // 1 minute
      if( (rMemory.ticks & 0x1A) == 0) {
        // do something
      }

      // 5 minutes
      if( (rMemory.ticks & 0x82) == 0) {
       // do something
      }

    },

    initRoom: function (room) {

      console.log('[' + room.name + '][Memory] Initiating.');

      var rMemory = room.memory;

      // things to keep
      var stage    = rMemory.stage    ? rMemory.stage    : false ;
      var template = rMemory.template ? rMemory.template : false ;

      // wipe first
      for (var prop in rMemory) {
        if (rMemory.hasOwnProperty(prop)) {
          delete rMemory[prop];
        }
      }

      // put things back (or initial set)
      rMemory.stage    = stage;
      rMemory.template = template ? template : 'default';

      // set config
      rMemory.version = global.config.version;
      rMemory.sources = {};

      // set resources
      _.forEach(room.find(FIND_SOURCES), (source) => {
        rMemory.sources[source.id] = source;
      });

    }

  }

});