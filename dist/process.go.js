module.exports = {

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
