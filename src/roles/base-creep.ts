/**
 * Base Creep AI
 * Base class for all creep roles
 * Provides common functionality and standardizes the AI approach
 */

import { Logger } from '../utils/logger';
import { CreepActionGuard } from '../utils/helpers';
import { MovementOptimizer } from '../utils/movement-optimizer';
import { TaskManager } from '../management/task-manager';
import * as _ from 'lodash';

export enum CreepState {
  Harvesting = 'harvesting',
  Working = 'working',
  Idle = 'idle',
  Transferring = 'transferring'
}

export interface RoleStrategy {
  getBodyParts(energy: number, rcl: number): BodyPartConstant[];
  getDefaultMemory(creep: Creep): Partial<CreepMemory>;
  runStateHarvesting(creep: Creep): void;
  runStateWorking(creep: Creep): void;
  runStateIdle?(creep: Creep): void;
  runStateTransferring?(creep: Creep): void;
}

export class BaseCreepAI {
  /**
   * Main task method for all creeps
   * Uses a state machine pattern with specialized handlers per role
   */
  public static task(creep: Creep, strategy: RoleStrategy): void {
    // --- Action pipeline guard (Screeps rule) ---
    CreepActionGuard.reset(creep);
    
    // --- TaskManager integration ---
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      // If we have a central task, execute it and return
      TaskManager.executeTask(creep, task);
      return;
    }
    
    // --- Initialize creep memory if needed ---
    if (!creep.memory.state) {
      // Default to harvesting state if empty inventory, working if has energy
      creep.memory.state = creep.store.getUsedCapacity() > 0 
        ? CreepState.Working 
        : CreepState.Harvesting;
    }
    
    // --- Handle state transitions ---
    if (creep.memory.state === CreepState.Harvesting && creep.store.getFreeCapacity() === 0) {
      // Full energy - switch to working
      creep.memory.state = CreepState.Working;
      creep.say('🔨 Working');
    } 
    else if ((creep.memory.state === CreepState.Working || 
              creep.memory.state === CreepState.Transferring) && 
              creep.store.getUsedCapacity() === 0) {
      // Out of energy - switch to harvesting
      creep.memory.state = CreepState.Harvesting;
      creep.say('🔄 Harvest');
    }
    
    // --- Execute current state ---
    try {
      switch (creep.memory.state) {
        case CreepState.Harvesting:
          strategy.runStateHarvesting(creep);
          break;
        case CreepState.Working:
          strategy.runStateWorking(creep);
          break;
        case CreepState.Transferring:
          if (strategy.runStateTransferring) {
            strategy.runStateTransferring(creep);
          } else {
            // Default transfer behavior if not implemented
            this.defaultTransferring(creep);
          }
          break;
        case CreepState.Idle:
          if (strategy.runStateIdle) {
            strategy.runStateIdle(creep);
          } else {
            // Default idle behavior if not implemented
            this.defaultIdle(creep);
          }
          break;
        default:
          // Reset to a valid state if we somehow get an invalid one
          creep.memory.state = CreepState.Harvesting;
          creep.say('🔄 Reset');
      }
    } catch (e) {
      Logger.error(`Error running ${creep.memory.role} AI for ${creep.name}: ${(e as Error).message}`);
      // Reset to harvesting state if there's an error
      creep.memory.state = CreepState.Harvesting;
    }
  }
  
  /**
   * Default transferring behavior for creeps
   * Transfers energy to spawns, extensions, then storage
   */
  private static defaultTransferring(creep: Creep): void {
    // Priority 1: Spawns and extensions that need energy
    const targets = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s) => (s.structureType === STRUCTURE_SPAWN || 
                     s.structureType === STRUCTURE_EXTENSION) && 
                     (s as StructureSpawn | StructureExtension).store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    
    if (targets.length > 0) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const target = creep.pos.findClosestByPath(targets);
        if (target) {
          const result = creep.transfer(target, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
            });
          }
        }
      }
      return;
    }
    
    // Priority 2: Storage
    if (creep.room.storage) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const result = creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.storage, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // If nowhere to transfer, switch to working
    creep.memory.state = CreepState.Working;
    creep.say('🔨 Working');
  }
  
  /**
   * Default idle behavior for creeps
   * Parks at the center of the room or near storage
   */
  private static defaultIdle(creep: Creep): void {
    // Try to find a parking spot
    const parkTarget = (creep.room.storage) 
      ? creep.room.storage.pos 
      : new RoomPosition(25, 25, creep.room.name);
    
    // Move to the parking spot
    MovementOptimizer.moveToTarget(creep, parkTarget, { 
      range: 3,
      visualizePathStyle: { stroke: '#ffffff', opacity: 0.1 }
    });
    
    // Every 10 ticks, check if we should switch to working
    if (Game.time % 10 === 0) {
      // If the room needs something, switch to working
      if (this.shouldWorkInstead(creep)) {
        creep.memory.state = CreepState.Working;
        creep.say('🔨 Work');
      }
    }
  }
  
  /**
   * Check if a creep should work instead of being idle
   */
  private static shouldWorkInstead(creep: Creep): boolean {
    // Check construction sites
    const constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES);
    if (constructionSites.length > 0) {
      return true;
    }
    
    // Check for damaged structures
    const damagedStructures = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.hits < s.hitsMax * 0.5 && 
                    s.structureType !== STRUCTURE_WALL &&
                    s.structureType !== STRUCTURE_RAMPART
    });
    if (damagedStructures.length > 0) {
      return true;
    }
    
    // Check controller upgrade priority - stay idle if not urgent
    const controllerIsUrgent = creep.room.controller && 
                              creep.room.controller.ticksToDowngrade < 5000;
    return controllerIsUrgent;
  }
  
  /**
   * Common harvesting behavior - get energy from storage, containers, or sources
   */
  public static harvestEnergy(creep: Creep): void {
    // First try storage if available and has energy
    if (creep.room.storage && creep.room.storage.store[RESOURCE_ENERGY] > 0) {
      if (CreepActionGuard.allow(creep, 'withdraw')) {
        if (creep.withdraw(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.storage, {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Next try containers with energy
    const containers = creep.room.find(FIND_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_CONTAINER && 
                     (s as StructureContainer).store[RESOURCE_ENERGY] > 0
    });
    
    if (containers.length > 0) {
      // Find the fullest container
      const sorted = _.sortBy(containers, c => -(c as StructureContainer).store[RESOURCE_ENERGY]);
      if (CreepActionGuard.allow(creep, 'withdraw')) {
        if (creep.withdraw(sorted[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, sorted[0], {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Fallback to harvesting from source
    const source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE);
    if (source) {
      if (CreepActionGuard.allow(creep, 'harvest')) {
        if (creep.harvest(source) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, source, {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // If no energy sources, become idle
    creep.memory.state = CreepState.Idle;
    creep.say('😴 Idle');
  }
  
  /**
   * Move to a different room via exits
   */
  public static moveToRoom(creep: Creep, targetRoomName: string): boolean {
    if (creep.room.name === targetRoomName) {
      return true; // Already in the target room
    }
    
    // Find exit to the target room
    const exitDir = Game.map.findExit(creep.room, targetRoomName);
    if (exitDir === ERR_NO_PATH || exitDir === ERR_INVALID_ARGS) {
      Logger.warning(`No path from ${creep.room.name} to ${targetRoomName} for ${creep.name}`);
      return false;
    }
    
    const exit = creep.pos.findClosestByPath(exitDir as FindConstant);
    if (!exit) {
      Logger.warning(`Could not find exit from ${creep.room.name} to ${targetRoomName} for ${creep.name}`);
      return false;
    }
    
    // Move to the exit
    MovementOptimizer.moveToTarget(creep, exit, {
      visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
    });
    
    return false; // Still en route
  }
  
  /**
   * Get optimal body parts for spawning based on role, energy, and RCL
   */
  public static getOptimalBody(
    role: string, 
    energy: number, 
    rcl: number,
    strategy: RoleStrategy
  ): BodyPartConstant[] {
    return strategy.getBodyParts(energy, rcl);
  }
}