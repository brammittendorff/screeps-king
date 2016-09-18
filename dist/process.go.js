module.exports = {

  // task creeps according to roles
  taskCreepsByTheirRoles: function(creeps) {

    // go through all creeps in object
    for (var c in creeps) {

      // vars
      var creep = creeps[c];
      var role = creep.memory.role;

      // check if creep has a role
      if (role == undefined) {
        role = creep.memory.role = 'harvester';
      }

      // load tasker for this creep, according to his role
      try {
      } catch (e) {
        var creepTasker = require('creep.' + role);
        creepTasker = false;
      }

      // execute creeps tasks
      if (creepTasker) {
        creepTasker.task(creep);
      }
    }

  },

  findAvailableSpawnInRoom: function(room) {
    var spawns = room.find(FIND_MY_SPAWNS);
    for (s in spawns) {
      var spawn = spawns[s];
      if (!spawn.spawning) {
        return spawn;
      }
    }
    return false;
  }

};
