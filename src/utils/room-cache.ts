// RoomCache utility: per-room, per-tick cache for expensive room.find() calls

export class RoomCache {
  private static cache: { [roomName: string]: { [findType: number]: { tick: number, result: any[] } } } = {};

  /**
   * Get cached result for a room.find(FIND_*) call, or perform and cache it if not present for this tick.
   * @param room The Room object
   * @param findType The FIND_* constant
   * @param opts Optional filter/options for room.find
   */
  public static get(room: Room, findType: FindConstant, opts?: FilterOptions<any>): any[] {
    if (!this.cache[room.name]) this.cache[room.name] = {};
    const entry = this.cache[room.name][findType];
    if (entry && entry.tick === Game.time) {
      return entry.result;
    }
    // Not cached for this tick, perform the find
    const result = room.find(findType, opts as any);
    this.cache[room.name][findType] = { tick: Game.time, result };
    return result;
  }

  /**
   * Clear the cache for all rooms (call at the start of each tick)
   */
  public static clear(): void {
    this.cache = {};
  }
}

// Type for filter options (from Screeps API)
type FilterOptions<T> = { filter?: (obj: T) => boolean } | { filter?: { [key: string]: any } }; 

if (Memory.analytics && Memory.analytics.history && Memory.analytics.history.length > 100) {
  Memory.analytics.history = Memory.analytics.history.slice(-100);
} 