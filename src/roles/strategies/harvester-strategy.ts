/**
 * Harvester Strategy
 * Implements the specific logic for the harvester role
 * using the BaseCreep architecture
 */

import { BaseCreepAI, CreepState, RoleStrategy } from '../base-creep';
import { CreepActionGuard } from '../../utils/helpers';
import { MovementOptimizer } from '../../utils/movement-optimizer';
import * as _ from 'lodash';

export class HarvesterStrategy implements RoleStrategy {
  /**
   * Get optimal body parts based on available energy and RCL
   */
  public getBodyParts(energy: number, rcl: number): BodyPartConstant[] {
    // Based on Screeps mechanics: 
    // - Source produces 10 energy/tick (3000 energy over 300 ticks)
    // - Each WORK part harvests 2 energy/tick
    // - 5 WORK parts will fully extract a source (5 × 2 = 10 energy/tick)
    
    // RCL 1 strategy: Balanced smaller harvesters to maximize concurrent work
    if (rcl === 1) {
      // Optimal early designs based on Screeps community best practices
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE]; // 300 energy - double WORK (4 energy/tick)
      if (energy >= 250) return [WORK, CARRY, CARRY, MOVE]; // 250 energy - balanced
      if (energy >= 200) return [WORK, CARRY, MOVE]; // 200 energy - minimum viable (WCM)
      return [WORK, CARRY, MOVE]; // Fallback
    }
    
    // RCL 2 strategy: Stronger harvesters but still distributed
    if (rcl === 2) {
      // At RCL 2 we're building toward 5 WORK parts per source
      if (energy >= 500) return [WORK, WORK, WORK, CARRY, MOVE, MOVE]; // 500 energy - 6 energy/tick
      if (energy >= 400) return [WORK, WORK, CARRY, MOVE, MOVE, MOVE]; // 400 energy - more mobility
      if (energy >= 350) return [WORK, WORK, CARRY, MOVE, MOVE]; // 350 energy - reliable
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE]; // 300 energy - efficient core
      if (energy >= 200) return [WORK, CARRY, MOVE]; // Fallback
      return [WORK, CARRY, MOVE]; // Minimum viable
    }
    
    // RCL 3 strategy: Transition to dedicated harvesters
    if (rcl === 3) {
      // For RCL 3 we start to transition toward stationary harvesters
      if (energy >= 700) return [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE]; // 700 energy - 8 energy/tick
      if (energy >= 550) return [WORK, WORK, WORK, CARRY, MOVE, MOVE]; // 550 energy - 6 energy/tick
      if (energy >= 450) return [WORK, WORK, WORK, CARRY, MOVE]; // 450 energy - 6 energy/tick
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE]; // 400 energy - balanced
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE]; // 300 energy - basic double WORK
      return [WORK, CARRY, MOVE]; // Minimum viable
    }
    
    if (rcl <= 5) {
      // Mid-game efficiency starts to matter more
      if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 450) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // For late game (RCL 6+), focus on maximum efficiency harvesting
    if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energy >= 650) return [WORK, WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    return [WORK, WORK, CARRY, MOVE];
  }
  
  /**
   * Get default memory for this role
   */
  public getDefaultMemory(creep: Creep): Partial<CreepMemory> {
    return {
      role: 'harvester',
      state: CreepState.Harvesting,
      homeRoom: creep.room.name
    };
  }
  
  /**
   * Handle harvesting state - harvest energy from sources
   */
  public runStateHarvesting(creep: Creep): void {

    // Log creep's current state for debugging
    if (Game.time % 10 === 0) {
      console.log(`Harvester ${creep.name} at ${creep.pos} in state ${creep.memory.state}, energy: ${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${creep.store.getCapacity()}`);
    }
    
    // Check if we have a specific source target in memory
    let source: Source | null;
    if (creep.memory.targetSourceId) {
      source = Game.getObjectById(creep.memory.targetSourceId as Id<Source>);
      
      // If the source doesn't exist anymore, clear the assignment
      if (!source) {
        delete creep.memory.targetSourceId;
      }
    }
    
    // If we don't have a source assignment, pick a new one intelligently
    if (!source) {
      const room = creep.room;
      const sources = room.find(FIND_SOURCES);
      
      // Count harvester assignments per source
      const harvesterCounts: Record<string, number> = {};
      for (const source of sources) {
        harvesterCounts[source.id] = 0;
      }
      
      // Count existing harvester assignments
      const harvesters = _.filter(Game.creeps, c => 
        c.memory.role === 'harvester' && 
        c.memory.homeRoom === room.name && 
        c.memory.targetSourceId !== undefined
      );
      
      for (const harvester of harvesters) {
        const targetId = harvester.memory.targetSourceId as Id<Source>;
        if (targetId && harvesterCounts[targetId] !== undefined) {
          harvesterCounts[targetId]++;
        }
      }
      
      // Get source with available spots from mapping
      const mapping = room.memory.mapping;
      const sourceInfos = mapping?.sources || [];
      let bestSource = null;
      let lowestRatio = Infinity;
      
      for (let i = 0; i < sources.length; i++) {
        const sourceId = sources[i].id;
        const sourceInfo = sourceInfos[i];
        const assignedHarvesters = harvesterCounts[sourceId] || 0;
        const availableSpots = sourceInfo?.spots || 1;
        
        // Calculate assignment ratio (lower is better)
        const ratio = assignedHarvesters / availableSpots;
        
        // Prefer source with lowest harvester-to-spot ratio
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          bestSource = sources[i];
        }
      }
      
      // Fallback to closest source if we couldn't find a best one
      source = bestSource || 
              creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE) || 
              creep.pos.findClosestByPath(FIND_SOURCES);
              
      // Save the source ID for future reference
      if (source) {
        creep.memory.targetSourceId = source.id;
        console.log(`Harvester ${creep.name} assigned to source ${source.id} with ratio ${lowestRatio}`);
      }
    }
    
    if (source) {
      if (CreepActionGuard.allow(creep, 'harvest')) {
        const harvestResult = creep.harvest(source);
        
        if (harvestResult === ERR_NOT_IN_RANGE) {
          // Move to the source if not in range
          const moveResult = MovementOptimizer.moveToTarget(creep, source, {
            visualizePathStyle: { stroke: '#ffaa00', opacity: 0.2 },
            range: 1
          });
          
          // Log movement issues
          if (moveResult !== OK && Game.time % 10 === 0) {
            console.log(`Harvester ${creep.name} move to source failed: ${moveResult}`);
          }
        } else if (harvestResult === OK) {
          // Successfully harvested energy
          if (Game.time % 10 === 0) {
            console.log(`Harvester ${creep.name} harvested energy: ${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${creep.store.getCapacity()}`);
          }
        } else {
          // Log any harvest errors
          if (Game.time % 10 === 0) {
            console.log(`Harvester ${creep.name} harvest failed: ${harvestResult}`);
          }
        }
      }
    } else {
      // If no active sources, try to wait near one
      const inactiveSources = creep.room.find(FIND_SOURCES);
      if (inactiveSources.length > 0) {
        const target = creep.pos.findClosestByPath(inactiveSources);
        MovementOptimizer.moveToTarget(creep, target!, {
          visualizePathStyle: { stroke: '#ffaa00', opacity: 0.1 },
          range: 1
        });
      }
    }
  }
  
  /**
   * Handle working state - transfer energy to structures
   */
  public runStateWorking(creep: Creep): void {

    // Log creep's working state for debugging
    if (Game.time % 10 === 0) {
      console.log(`Harvester ${creep.name} working, energy: ${creep.store.getUsedCapacity(RESOURCE_ENERGY)}/${creep.store.getCapacity()}`);
    }

    // Priority 1: Fill spawns and extensions
    const spawnOrExtension = creep.pos.findClosestByPath(FIND_MY_STRUCTURES, {
      filter: (structure): structure is StructureSpawn | StructureExtension => {
        return (structure.structureType === STRUCTURE_EXTENSION || 
                structure.structureType === STRUCTURE_SPAWN) &&
                'store' in structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    
    if (spawnOrExtension) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        const transferResult = creep.transfer(spawnOrExtension, RESOURCE_ENERGY);
        if (transferResult === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, spawnOrExtension, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        } else if (transferResult === OK) {
          if (Game.time % 10 === 0) {
            console.log(`Harvester ${creep.name} transferred energy to ${spawnOrExtension.structureType}`);
          }
        } else {
          if (Game.time % 10 === 0) {
            console.log(`Harvester ${creep.name} transfer failed: ${transferResult}`);
          }
        }
      }
      return;
    }
    
    // Priority 2: Fill towers with less than 80% energy
    const towers = creep.room.find(FIND_MY_STRUCTURES, {
      filter: (structure): structure is StructureTower => {
        return structure.structureType === STRUCTURE_TOWER && 
               'store' in structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 
               structure.store.getCapacity(RESOURCE_ENERGY) * 0.2;
      }
    });
    
    if (towers.length > 0) {
      // Sort by energy - fill the emptiest tower first
      const sortedTowers = _.sortBy(towers, tower => tower.store.getUsedCapacity(RESOURCE_ENERGY));
      
      if (CreepActionGuard.allow(creep, 'transfer')) {
        if (creep.transfer(sortedTowers[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, sortedTowers[0], {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Priority 3: Fill storage
    if (creep.room.storage && 'store' in creep.room.storage) {
      if (CreepActionGuard.allow(creep, 'transfer')) {
        if (creep.transfer(creep.room.storage, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.storage, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
          });
        }
      }
      return;
    }
    
    // Priority 4: Fill containers
    const containers = creep.room.find(FIND_STRUCTURES, {
      filter: (structure) => {
        return structure.structureType === STRUCTURE_CONTAINER &&
               'store' in structure && structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
      }
    });
    
    if (containers.length > 0) {
      const container = creep.pos.findClosestByPath(containers);
      if (container) {
        if (CreepActionGuard.allow(creep, 'transfer')) {
          if (creep.transfer(container, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
            MovementOptimizer.moveToTarget(creep, container, {
              visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 }
            });
          }
        }
      }
      return;
    }
    
    // Priority 5: If no structures need energy, upgrade controller instead
    if (creep.room.controller) {
      if (CreepActionGuard.allow(creep, 'upgradeController')) {
        if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          MovementOptimizer.moveToTarget(creep, creep.room.controller, {
            visualizePathStyle: { stroke: '#ffffff', opacity: 0.2 },
            range: 3
          });
        }
      }
    }
  }
}