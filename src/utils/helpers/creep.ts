export const creepHelpers = {
  canSpawnCreep: function(spawn, body, name, memory) {
    return spawn.spawnCreep(body, name, { dryRun: true, memory }) === OK;
  },
  spawnCreep: function(spawn, body, name, memory) {
    return spawn.spawnCreep(body, name, { memory });
  },
  getEnergy: function(structure) {
    if (!structure) return 0;
    // Check for store API (newer)
    if (structure.store) {
      return structure.store[RESOURCE_ENERGY] || 0;
    }
    // Traditional API
    return structure.energy || 0;
  },
  getEnergyCapacity: function(structure) {
    if (!structure) return 0;
    // Check for store API (newer)
    if (structure.store) {
      if (structure.store.getCapacity) {
        return structure.store.getCapacity(RESOURCE_ENERGY) || 0;
      }
      return structure.storeCapacity || 0;
    }
    // Traditional API
    return structure.energyCapacity || 0;
  },
  getBodyCost: function(body) {
    return body.reduce((cost, part) => {
      return cost + BODYPART_COST[part];
    }, 0);
  }
}; 