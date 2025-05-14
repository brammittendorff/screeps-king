/**
 * Creep Spawner
 * Handles the spawning of creeps by processing spawn requests
 */

import { Logger } from '../utils/logger';
import { Helpers } from '../utils/helpers';
import { CreepRole } from './creep-types';

export interface CreepRequest {
  role: CreepRole;
  body: BodyPartConstant[];
  memory: Partial<CreepMemory>;
  priority: number;
  roomName: string;
  retryCount?: number;
}

export class CreepSpawner {
  private static spawnQueue: Record<string, CreepRequest[]> = {};
  
  /**
   * Request a creep to be spawned
   */
  public static requestCreep(request: CreepRequest): void {
    if (!this.spawnQueue[request.roomName]) {
      this.spawnQueue[request.roomName] = [];
    }
    this.spawnQueue[request.roomName].push(request);
    // Sort by priority (highest first)
    this.spawnQueue[request.roomName].sort((a, b) => b.priority - a.priority);
    // LOG: Requesting creep
    Logger.info(`Queued request for role=${request.role} in room=${request.roomName} (priority=${request.priority})`);
  }
  
  /**
   * Process the spawn queue for all rooms
   */
  public static processSpawns(): void {
    for (const roomName in this.spawnQueue) {
      const room = Game.rooms[roomName];
      if (!room) continue;
      if (this.spawnQueue[roomName].length === 0) continue;
      
      const availableSpawns = room.find(FIND_MY_SPAWNS, {
        filter: (spawn) => !spawn.spawning
      });
      
      if (availableSpawns.length === 0) {
        Logger.info(`[CreepSpawner] No available spawns in room ${roomName}, waiting...`);
        continue;
      }
      
      const request = this.spawnQueue[roomName][0];
      
      // Validate the request before attempting to spawn
      if (!request || !request.role || !request.body || request.body.length === 0) {
        Logger.error(`[CreepSpawner] Invalid spawn request in room ${roomName}: ${JSON.stringify(request)}`);
        this.spawnQueue[roomName].shift(); // Remove invalid request
        continue;
      }
      
      // LOG: About to spawn
      Logger.info(`[CreepSpawner] Attempting to spawn role=${request.role} in room=${roomName} at spawn=${availableSpawns[0].name}`);
      const result = this.spawnCreep(availableSpawns[0], request);
      
      // LOG: Spawn result
      if (result === OK) {
        Logger.info(`[CreepSpawner] SUCCESS: Spawned ${request.role} in room=${roomName}`);
        this.spawnQueue[roomName].shift();
      } else if (result === ERR_NOT_ENOUGH_ENERGY) {
        Logger.info(`[CreepSpawner] WAITING: Not enough energy to spawn ${request.role} in room=${roomName}`);
      } else if (result === ERR_NAME_EXISTS) {
        // Just try again with a different name next tick
        Logger.warn(`[CreepSpawner] Name collision for ${request.role} in room=${roomName}, will try again`);
      } else {
        Logger.error(`[CreepSpawner] ERROR: Failed to spawn ${request.role} in room=${roomName} (code=${result})`);
        
        // We'll retry a few times before giving up
        if (!request.retryCount) {
          request.retryCount = 1;
        } else {
          request.retryCount++;
        }
        
        // After 5 retries, remove from queue
        if (request.retryCount > 5) {
          Logger.error(`[CreepSpawner] Removing request after 5 failed attempts: ${JSON.stringify(request)}`);
          this.spawnQueue[roomName].shift();
        }
      }
    }
  }
  
  /**
   * Try to spawn a creep with the given request
   */
  private static spawnCreep(spawn: StructureSpawn, request: CreepRequest): ScreepsReturnCode {
    const name = `${request.role}_${request.roomName}_${Game.time}_${Math.floor(Math.random() * 100)}`;
    if (!request.memory.homeRoom) {
      request.memory.homeRoom = spawn.room.name;
    }
    
    Logger.info(`[CreepSpawner] Spawning: role=${request.role}, name=${name}, room=${request.roomName}, memory=${JSON.stringify(request.memory)}`);
    if (!Helpers.canSpawnCreep(spawn, request.body, name, request.memory)) {
      Logger.info(`[CreepSpawner] canSpawnCreep=FALSE for ${name}`);
      return ERR_NOT_ENOUGH_ENERGY;
    }
    
    const spawnResult = Helpers.spawnCreep(spawn, request.body, name, request.memory);
    Logger.info(`[CreepSpawner] spawnCreep result for ${name}: ${spawnResult}`);
    return spawnResult;
  }
  
  /**
   * Get the current spawn queue (for testing and debugging)
   */
  public static getSpawnQueue(): Record<string, CreepRequest[]> {
    return this.spawnQueue;
  }
  
  /**
   * Clear the spawn queue (useful for testing and reset)
   */
  public static clearSpawnQueue(): void {
    this.spawnQueue = {};
  }
}