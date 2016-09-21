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

    }

  }

});