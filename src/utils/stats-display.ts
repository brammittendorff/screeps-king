/**
 * Stats Display
 * Shows important game statistics in the console
 */

import { Logger } from './logger';
import * as _ from 'lodash';

export class StatsDisplay {
  /**
   * Display colony statistics
   */
  public static showStats(): void {
    // Calculate various statistics
    const cpuUsed = Game.cpu.getUsed().toFixed(2);
    const cpuLimit = Game.cpu.limit;
    const cpuPercent = ((Game.cpu.getUsed() / Game.cpu.limit) * 100).toFixed(1);
    const bucketLevel = Game.cpu.bucket;
    const bucketPercent = ((Game.cpu.bucket / 10000) * 100).toFixed(1);
    
    const memoryUsed = (RawMemory.get().length / 1024).toFixed(2);
    const gcl = Game.gcl.level;
    const gclProgress = ((Game.gcl.progress / Game.gcl.progressTotal) * 100).toFixed(1);
    
    const roomCount = Object.keys(Game.rooms).length;
    const myRoomCount = _.filter(Game.rooms, r => r.controller && r.controller.my).length;
    const creepCount = Object.keys(Game.creeps).length;
    const spawnCount = Object.keys(Game.spawns).length;
    
    // Build the display string
    let display = `
<span style="color: #00ffff; font-weight: bold;">===== SCREEPS-KING STATS =====</span>

<span style="color: #ffff00;">PERFORMANCE:</span>
  CPU: ${cpuUsed}/${cpuLimit} (${cpuPercent}%) | Bucket: ${bucketLevel}/10000 (${bucketPercent}%)
  Memory: ${memoryUsed} KB

<span style="color: #ffff00;">GAME STATUS:</span>
  GCL: ${gcl} (${gclProgress}% to next level)
  Rooms: ${myRoomCount} owned of ${roomCount} visible
  Creeps: ${creepCount} | Spawns: ${spawnCount}

<span style="color: #ffff00;">COLONY STATUS:</span>`;

    // Add room details
    const myRooms = _.filter(Game.rooms, r => r.controller && r.controller.my);
    for (const room of myRooms) {
      const energyAvailable = room.energyAvailable;
      const energyCapacity = room.energyCapacityAvailable;
      const energyPercent = ((energyAvailable / energyCapacity) * 100).toFixed(1);
      
      const rcl = room.controller?.level || 0;
      const rclProgress = room.controller ? ((room.controller.progress / room.controller.progressTotal) * 100).toFixed(1) : '0';
      
      const storage = room.storage ? `${Math.floor(room.storage.store[RESOURCE_ENERGY] / 1000)}K` : 'None';
      
      display += `
  <span style="color: #00cc00;">${room.name}</span> (RCL ${rcl}, ${rclProgress}%):
    Energy: ${energyAvailable}/${energyCapacity} (${energyPercent}%)
    Storage: ${storage}
    Creeps: ${_.filter(Game.creeps, c => c.memory.homeRoom === room.name).length}`;
    }
    
    // Add memory usage warning if needed
    if (parseFloat(memoryUsed) > 1800) {
      display += `

<span style="color: #ff0000;">WARNING: Memory usage is high (${memoryUsed} KB). Consider cleaning up Memory.</span>`;
    }
    
    // Add help reminder
    display += `

<span style="color: #aaaaaa;">Type 'help()' for available commands</span>`;
    
    // Log the stats
    console.log(display);
  }
}