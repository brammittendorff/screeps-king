// RoomTaskManager: Batched, on-demand room task generator
// No tasks are stored in Memory; all are generated per tick

export interface RoomBatchedTasks {
  refill: Id<Structure>[];
  repair: Id<Structure>[];
  pickup: Id<Resource>[];
}

export class RoomTaskManager {
  /**
   * Generate batched tasks for a room (on demand, per tick)
   */
  public static getTasks(room: Room): RoomBatchedTasks {
    // 1. Refill: all spawns, extensions, towers needing energy
    const refill: Id<Structure>[] = room.find(FIND_MY_STRUCTURES, {
      filter: (s: Structure) => {
        if (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION || s.structureType === STRUCTURE_TOWER) {
          // @ts-ignore
          return s.store && s.store.getFreeCapacity && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        }
        return false;
      }
    }).map(s => s.id as Id<Structure>);

    // 2. Repair: all structures below 75% health and < 1,000,000 hits
    const repair: Id<Structure>[] = room.find(FIND_STRUCTURES, {
      filter: (s: Structure) => s.hits !== undefined && s.hits < s.hitsMax * 0.75 && s.hits < 1000000
    }).map(s => s.id as Id<Structure>);

    // 3. Pickup: all dropped energy > 50
    const pickup: Id<Resource>[] = room.find(FIND_DROPPED_RESOURCES, {
      filter: (r: Resource) => r.resourceType === RESOURCE_ENERGY && r.amount > 50
    }).map(r => r.id as Id<Resource>);

    return { refill, repair, pickup };
  }
} 