/**
 * Claimer AI
 * Used to claim new rooms for expansion
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';

export class ClaimerAI {
  /**
   * Main task method for claimer creeps
   */
  @Profiler.wrap('ClaimerAI.task')
  public static task(creep: Creep): void {
    // Ensure we have a target room
    if (!creep.memory.targetRoom) {
      Logger.error(`Claimer ${creep.name} has no target room`);
      creep.say('❓ No target');
      return;
    }

    // If we're not in the target room, travel there
    if (creep.room.name !== creep.memory.targetRoom) {
      this.travelToTargetRoom(creep);
      return;
    }

    // If we're in the target room, claim the controller
    if (creep.room.controller) {
      // Check if controller is already owned or reserved by someone else
      if (creep.room.controller.owner && !creep.room.controller.my) {
        Logger.warn(`Room ${creep.room.name} is already owned by ${creep.room.controller.owner.username}`);
        creep.say('⚠️ Claimed');
        
        // Set a new target if possible
        if (Memory.colony && Memory.colony.expansionTargets && Memory.colony.expansionTargets.length > 0) {
          for (const roomName of Memory.colony.expansionTargets) {
            if (roomName !== creep.memory.targetRoom) {
              creep.memory.targetRoom = roomName;
              Logger.info(`Redirecting claimer ${creep.name} to ${roomName}`);
              break;
            }
          }
        }
        return;
      }

      // If controller is reserved by someone else, attack-reserve it
      if (creep.room.controller.reservation && 
          creep.room.controller.reservation.username !== 
          (Game.spawns[Object.keys(Game.spawns)[0]] ? Game.spawns[Object.keys(Game.spawns)[0]].owner.username : '')) {
        
        const result = creep.attackController(creep.room.controller);
        if (result === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller, {
            visualizePathStyle: { stroke: '#ff0000' }
          });
          creep.say('🗡️ Attack');
        } else if (result === OK) {
          creep.say('🗡️ Removing');
        } else {
          creep.say(`❌ ${result}`);
        }
        return;
      }

      // Attempt to claim the controller
      const result = creep.claimController(creep.room.controller);
      
      if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(creep.room.controller, {
          visualizePathStyle: { stroke: '#ffffff' }
        });
        creep.say('🚶 To ctrl');
      } else if (result === OK) {
        // Successfully claimed!
        Logger.info(`Successfully claimed room ${creep.room.name}!`, 'ClaimerAI');
        creep.say('🏳️ Claimed!');
        
        // Initialize colony memory for the new room
        if (!Memory.colony.rooms.owned.includes(creep.room.name)) {
          Memory.colony.rooms.owned.push(creep.room.name);
          
          // Remove from expansion targets
          Memory.colony.expansionTargets = Memory.colony.expansionTargets.filter(r => r !== creep.room.name);
          
          // Initialize room memory
          if (!Memory.rooms[creep.room.name]) {
            Memory.rooms[creep.room.name] = {
              stage: 0,
              initialized: false
            } as any;
          }
        }
        
        // Look for spawn locations
        this.findSpawnLocations(creep);
      } else if (result === ERR_GCL_NOT_ENOUGH) {
        // GCL not high enough, reserve instead
        creep.say('⚠️ Low GCL');
        Logger.warn(`Cannot claim ${creep.room.name} - GCL too low`, 'ClaimerAI');
        
        const reserveResult = creep.reserveController(creep.room.controller);
        if (reserveResult === ERR_NOT_IN_RANGE) {
          creep.moveTo(creep.room.controller);
        }
      } else {
        creep.say(`❌ ${result}`);
      }
    } else {
      creep.say('❓ No ctrl');
    }
  }

  /**
   * Travel to the target room
   */
  private static travelToTargetRoom(creep: Creep): void {
    const targetRoom = creep.memory.targetRoom;
    
    // Find exit to target room
    const exitDir = Game.map.findExit(creep.room, targetRoom);
    if (exitDir === ERR_NO_PATH) {
      Logger.error(`No path from ${creep.room.name} to ${targetRoom}`);
      creep.say('❌ No path');
      return;
    }
    
    const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
    if (!exit) {
      Logger.error(`Cannot find exit from ${creep.room.name} to ${targetRoom}`);
      creep.say('❌ No exit');
      return;
    }
    
    // Move to the exit
    creep.moveTo(exit, {
      visualizePathStyle: { stroke: '#ffffff' }
    });
    creep.say(`🛣️ ${targetRoom}`);
  }

  /**
   * Find good locations for a spawn in the newly claimed room
   */
  private static findSpawnLocations(creep: Creep): void {
    // Basic algorithm: find a spot near the controller that has open space around it
    const room = creep.room;
    const controller = room.controller;
    
    if (!controller) return;
    
    // Find sources
    const sources = room.find(FIND_SOURCES);
    if (sources.length === 0) return;
    
    // Find a location that is:
    // 1. Not too close to edges
    // 2. Has space around it for other structures
    // 3. Has reasonable access to sources and controller
    
    let bestScore = -1;
    let bestPos: RoomPosition | null = null;
    
    // Check a grid of positions
    for (let x = 5; x < 45; x += 2) {
      for (let y = 5; y < 45; y += 2) {
        const pos = new RoomPosition(x, y, room.name);
        
        // Check if position is walkable
        const terrain = new Room.Terrain(room.name);
        if (terrain.get(x, y) === TERRAIN_MASK_WALL) continue;
        
        // Check open space around (need 3x3 area for spawn and immediate buildings)
        let openSpace = true;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (terrain.get(x + dx, y + dy) === TERRAIN_MASK_WALL) {
              openSpace = false;
              break;
            }
          }
          if (!openSpace) break;
        }
        
        if (!openSpace) continue;
        
        // Calculate score based on distance to sources and controller
        let score = 0;
        
        // Controller distance (closer is better, but not too close)
        const controllerDist = pos.getRangeTo(controller.pos);
        if (controllerDist < 3) continue; // Too close to controller
        if (controllerDist > 15) continue; // Too far from controller
        score += (20 - controllerDist) * 2;
        
        // Source distances (closer is better)
        let totalSourceDist = 0;
        let minSourceDist = 100;
        
        for (const source of sources) {
          const dist = pos.getRangeTo(source.pos);
          totalSourceDist += dist;
          if (dist < minSourceDist) minSourceDist = dist;
        }
        
        if (minSourceDist < 2) continue; // Too close to source
        if (minSourceDist > 15) continue; // Too far from sources
        
        score += (20 - (totalSourceDist / sources.length)) * 3;
        
        // Check room for spawn location (avoid edges)
        if (x < 10 || x > 40 || y < 10 || y > 40) {
          score -= 20; // Penalize edge proximity
        }
        
        // Update best position if this is better
        if (score > bestScore) {
          bestScore = score;
          bestPos = pos;
        }
      }
    }
    
    // Mark the best spawn location
    if (bestPos) {
      // Create a spawn site at the best location
      const result = room.createConstructionSite(bestPos.x, bestPos.y, STRUCTURE_SPAWN);
      
      if (result === OK) {
        Logger.info(`Created spawn construction site at ${bestPos.x},${bestPos.y} in ${room.name}`, 'ClaimerAI');
        
        // Also create a few extensions nearby
        const extensionPositions = [
          {x: bestPos.x + 2, y: bestPos.y},
          {x: bestPos.x - 2, y: bestPos.y},
          {x: bestPos.x, y: bestPos.y + 2},
          {x: bestPos.x, y: bestPos.y - 2}
        ];
        
        for (const pos of extensionPositions) {
          // Check if position is valid
          if (pos.x >= 1 && pos.x <= 48 && pos.y >= 1 && pos.y <= 48) {
            const terrain = new Room.Terrain(room.name);
            if (terrain.get(pos.x, pos.y) !== TERRAIN_MASK_WALL) {
              room.createConstructionSite(pos.x, pos.y, STRUCTURE_EXTENSION);
            }
          }
        }
      }
    }
  }
}