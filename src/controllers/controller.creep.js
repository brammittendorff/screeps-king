Object.assign(component, {

  creep: {

    routine: function (creep) {

      var cMemory = creep.memory;

      // no role, be a harvester
      if (cMemory.role === undefined) {
        cMemory.role = creep.memory.role = 'harvester';
      }

      // task creep by their role
      if (global.ai[cMemory.role]) {
        global.ai[cMemory.role].task(creep);
      }

    }

  }

});