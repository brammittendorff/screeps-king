/**
 * Claimer Strategy
 * Implements the specific logic for the claimer role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { Logger } from '../../utils/logger';
import * as _ from 'lodash';

export class ClaimerStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Claimers only need one CLAIM part and movement
    // They're most efficient with just enough MOVE parts
    
    if (energy >= 850) return [CLAIM, MOVE, MOVE, MOVE];
    if (energy >= 700) return [CLAIM, MOVE, MOVE];
    return [CLAIM, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'claimer',
      state: CreepState.Working, // Claimers are always in working state - they don't harvest
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Override for harvesting state - not used by claimers
   */
  public runStateHarvesting(creep: Creep): void {
    // Claimers don't harvest, change to working state
    creep.memory.state = CreepState.Working;
    creep.say('🚩 Claim');
  }
  
  /**
   * Handle working state - travel to target room and claim controller
   */
  public runStateWorking(creep: Creep): void {
    // Ensure we have a target room
    if (!creep.memory.targetRoom) {
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
        creep.say('⚠️ Claimed');
        
        // Set a new target if possible
        if (Memory.colony && Memory.colony.expansionTargets && Memory.colony.expansionTargets.length > 0) {
          for (const roomName of Memory.colony.expansionTargets) {
            if (roomName !== creep.memory.targetRoom) {
              creep.memory.targetRoom = roomName;
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
        
        if (CreepActionGuard.allow(creep, 'attackController')) {
          const result = creep.attackController(creep.room.controller);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, creep.room.controller, {
              visualizePathStyle: { stroke: '#ff0000', opacity: 0.3 }
            });
            creep.say('🗡️ Attack');
          } else if (result === OK) {
            creep.say('🗡️ Removing');
          } else {
            creep.say(`❌ ${result}`);
          }
        }
        return;
      }

      // Attempt to claim the controller
      if (CreepActionGuard.allow(creep, 'claimController')) {
        const result = creep.claimController(creep.room.controller);
        
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 }
          });
          creep.say('🚩 To ctrl');
        } else if (result === OK) {
          // Successfully claimed!
          creep.say('🏳️ Claimed!');
          
          // Initialize colony memory for the new room
          if (Memory.colony && Memory.colony.rooms && Memory.colony.rooms.owned) {
            if (!Memory.colony.rooms.owned.includes(creep.room.name)) {
              Memory.colony.rooms.owned.push(creep.room.name);
              
              // Remove from expansion targets
              if (Memory.colony.expansionTargets) {
                Memory.colony.expansionTargets = Memory.colony.expansionTargets.filter(r => r !== creep.room.name);
              }
              
              // Initialize room memory
              if (!Memory.rooms[creep.room.name]) {
                Memory.rooms[creep.room.name] = {
                  stage: 0,
                  initialized: false
                } as any;
              }
            }
          }
          
          // Look for spawn locations
          this.findSpawnLocations(creep);
        } else if (result === ERR_GCL_NOT_ENOUGH) {
          // GCL not high enough, reserve instead
          creep.say('⚠️ Low GCL');
          
          if (CreepActionGuard.allow(creep, 'reserveController')) {
            const reserveResult = creep.reserveController(creep.room.controller);
            if (reserveResult === ERR_NOT_IN_RANGE) {
              MovementOptimizer.moveToTarget(creep, creep.room.controller);
            }
          }
        } else {
          creep.say(`❌ ${result}`);
        }
      }
    } else {
      creep.say('❓ No ctrl');
    }
  }
  
  /**
   * Travel to the target room
   */
  private travelToTargetRoom(creep: Creep): void {
    // Use the BaseCreep moveToRoom method
    if (creep.memory.targetRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.targetRoom);
      creep.say(`🛣️ ${creep.memory.targetRoom}`);
    }
  }
  
  /**
   * Find good locations for a spawn in the newly claimed room
   */
  private findSpawnLocations(creep: Creep): void {
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
        Logger.info(`Created spawn construction site at ${bestPos.x},${bestPos.y} in ${room.name}`);
        
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