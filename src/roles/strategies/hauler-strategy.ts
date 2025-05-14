/**
 * Hauler Strategy
 * Implements the specific logic for the hauler role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import { TaskManager } from '../../management/task-manager';
import { RoomTaskManager } from '../../management/room-task-manager';
import { RoomCache } from '../../utils/room-cache';
import * as _ from 'lodash';

export class HaulerStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Early game (RCL 1-2): More CARRY parts
    if (rcl <= 2) {
      if (energy >= 400) return [CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 300) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE]; 
      return [CARRY, CARRY, MOVE, MOVE];
    }
    
    // Medium game (RCL 3-4): Balanced CARRY/MOVE
    if (rcl <= 4) {
      if (energy >= 800) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 500) return [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
      return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
    }
    
    // Late game (RCL 5+): Large capacity haulers
    if (rcl >= 5) {
      if (energy >= 1500) {
        const body: BodyPartConstant[] = [];
        const partPairs = Math.min(16, Math.floor(energy / 100)); // Up to 16 CARRY+MOVE pairs (32 parts)
        for (let i = 0; i < partPairs; i++) {
          body.push(CARRY);
          body.push(MOVE);
        }
        return body;
      }
      if (energy >= 1000) return [CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE];
      return [CARRY, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE, MOVE];
    }
    
    // Fallback
    return [CARRY, CARRY, MOVE, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'hauler',
      state: CreepState.Harvesting, // Harvesting = collecting, Working = delivering
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - collect energy
   */
  public runStateHarvesting(creep: Creep): void {
    // Priority 1: Use TaskManager for special/remote tasks
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    }
    
    // Use mapping for optimal collection if available
    const mapping = creep.room.memory.mapping;
    if (mapping && mapping.sources && mapping.sources.length > 0) {
      // Prefer containers at sources or storage
      let containers: (StructureContainer | StructureStorage)[] = [];
      
      // Check mapped source positions for containers
      for (const source of mapping.sources) {
        const found = creep.room.lookForAt(LOOK_STRUCTURES, source.x, source.y)
          .filter((s): s is StructureContainer => s.structureType === STRUCTURE_CONTAINER && 
                    'store' in s && s.store[RESOURCE_ENERGY] > 0);
        containers = containers.concat(found as (StructureContainer | StructureStorage)[]);
      }
      
      // Add storage if available
      if (mapping.storage) {
        const storageObj = Game.getObjectById(mapping.storage.id as Id<StructureStorage>);
        if (storageObj && 'store' in storageObj && storageObj.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
          containers.push(storageObj as StructureStorage);
        }
      }
      
      // Sort containers by energy amount (most first)
      containers = _.sortBy(containers, s => 
        -((s as StructureContainer | StructureStorage).store[RESOURCE_ENERGY]));
      
      if (containers.length > 0) {
        if (CreepActionGuard.allow(creep, 'withdraw')) {
          const result = creep.withdraw(containers[0], RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, containers[0], {
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
            });
          }
        }
        return;
      }
    }
    
    // Priority 2: Use batched pickup targets
    const roomTasks = RoomTaskManager.getTasks(creep.room);
    const pickupTargets = roomTasks.pickup
      .map(id => Game.getObjectById(id))
      .filter((r): r is Resource => !!r);
      
    if (pickupTargets.length > 0) {
      const target = creep.pos.findClosestByPath(pickupTargets);
      if (target) {
        if (CreepActionGuard.allow(creep, 'pickup')) {
          const result = creep.pickup(target);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
            });
          }
        }
        return;
      }
    }
    
    // Priority 3: Containers/storage with energy
    let sources = RoomCache.get(creep.room, FIND_STRUCTURES, {
      filter: (s: AnyStructure) =>
        (s.structureType === STRUCTURE_CONTAINER || s.structureType === STRUCTURE_STORAGE) &&
        s.store.getUsedCapacity(RESOURCE_ENERGY) > 0
    }) as (StructureContainer | StructureStorage)[];
    
    sources = _.sortBy(sources, s => -s.store[RESOURCE_ENERGY]);
    
    if (sources.length > 0) {
      if (CreepActionGuard.allow(creep, 'withdraw')) {
        const result = creep.withdraw(sources[0], RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, sources[0], {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Priority 4: Fallback - harvest from source (if no containers/storage)
    const sourcesRaw = RoomCache.get(creep.room, FIND_SOURCES_ACTIVE);
    if (sourcesRaw.length > 0) {
      if (CreepActionGuard.allow(creep, 'harvest')) {
        const result = creep.harvest(sourcesRaw[0]);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, sourcesRaw[0], {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Nothing to do - go idle at storage or spawn
    creep.memory.state = CreepState.Idle;
    creep.say('❓ idle');
  }
  
  /**
   * Handle working state - deliver energy
   */
  public runStateWorking(creep: Creep): void {
    // If we're in the wrong room, go to the home room
    if (creep.memory.homeRoom && creep.room.name !== creep.memory.homeRoom) {
      BaseCreepAI.moveToRoom(creep, creep.memory.homeRoom);
      return;
    }
    
    // Priority 1: Use TaskManager for special/remote tasks
    const task = TaskManager.findTaskForCreep(creep);
    if (task) {
      TaskManager.executeTask(creep, task);
      return;
    }
    
    // Priority 2: Use batched refill targets
    const roomTasks = RoomTaskManager.getTasks(creep.room);
    const refillTargets = roomTasks.refill
      .map(id => Game.getObjectById(id))
      .filter((s): s is Structure => !!s)
      .sort((a, b) => {
        // Priority: spawn < extension < tower
        const priority = (s: Structure) =>
          s.structureType === STRUCTURE_SPAWN ? 0 :
          s.structureType === STRUCTURE_EXTENSION ? 1 :
          s.structureType === STRUCTURE_TOWER ? 2 : 3;
        return priority(a) - priority(b);
      });
      
    if (refillTargets.length > 0) {
      const target = creep.pos.findClosestByPath(refillTargets);
      if (target) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          const result = creep.transfer(target, RESOURCE_ENERGY);
          if (result === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, target, {
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
            });
          }
        }
        return;
      }
    }
    
    // Priority 3: Fill spawns and extensions
    const spawns = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_SPAWN && 
                    'store' in s && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    
    if (spawns.length > 0) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const result = creep.transfer(spawns[0], RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, spawns[0], {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
        return;
      }
    }
    
    const extensions = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_EXTENSION && 
                    'store' in s && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    
    if (extensions.length > 0) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const result = creep.transfer(extensions[0], RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, extensions[0], {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
        return;
      }
    }
    
    // Priority 4: Fill towers
    const towers = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (s) => s.structureType === STRUCTURE_TOWER && 
                    'store' in s && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    });
    
    if (towers.length > 0) {
      // Sort by energy - fill lowest first
      towers.sort((a, b) => 
        ('store' in a ? a.store.getUsedCapacity(RESOURCE_ENERGY) : 0) - 
        ('store' in b ? b.store.getUsedCapacity(RESOURCE_ENERGY) : 0)
      );
      
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const result = creep.transfer(towers[0], RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, towers[0], {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
        return;
      }
    }
    
    // Priority 5: Fill storage if available
    if (creep.room.storage && 'store' in creep.room.storage && creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const result = creep.transfer(creep.room.storage, RESOURCE_ENERGY);
        if (result === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.storage, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
        return;
      }
    }
    
    // Nothing to do - go idle
    creep.memory.state = CreepState.Idle;
    creep.say('❓ idle');
  }
  
  /**
   * Handle idle state - go to storage or spawn and check for new tasks
   */
  public runStateIdle(creep: Creep): void {
    // Check for new tasks every 5 ticks
    if (Game.time % 5 === 0) {
      // Check if any energy delivery is needed
      const roomTasks = RoomTaskManager.getTasks(creep.room);
      if (roomTasks.refill.length > 0) {
        creep.memory.state = CreepState.Working;
        creep.say('⚡ deliver');
        return;
      }
      
      // Check for dropped resources
      if (roomTasks.pickup.length > 0) {
        creep.memory.state = CreepState.Harvesting;
        creep.say('🔄 collect');
        return;
      }
      
      // Check if we have energy to deliver
      if (creep.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        const structures = creep.room.find(FIND_MY_STRUCTURES, {
          filter: (s) => (s.structureType === STRUCTURE_SPAWN || 
                          s.structureType === STRUCTURE_EXTENSION || 
                          s.structureType === STRUCTURE_TOWER) && 
                         s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        });
        
        if (structures.length > 0) {
          creep.memory.state = CreepState.Working;
          creep.say('⚡ deliver');
          return;
        }
      }
      
      // Check if storage needs a refill from containers
      const containers = creep.room.find(FIND_STRUCTURES, {
        filter: (s) => s.structureType === STRUCTURE_CONTAINER && 
                      (s as StructureContainer).store.getUsedCapacity(RESOURCE_ENERGY) > 200
      });
      
      if (containers.length > 0 && creep.room.storage && 
          creep.room.storage.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
        creep.memory.state = CreepState.Harvesting;
        creep.say('🔄 collect');
        return;
      }
    }
    
    // Idle at storage or spawn
    const idleTarget = (creep.room.storage) || 
                      (creep.room.find(FIND_MY_SPAWNS)[0]) || 
                      new RoomPosition(25, 25, creep.room.name);
    
    MovementOptimizer.moveToTarget(creep, idleTarget, { 
      range: 3, 
      visualizePathStyle: { opacity: 0.1 } 
    });
  }
}