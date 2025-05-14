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
    // Basic harvester - all RCL levels
    if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
    if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
    if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
    if (energy >= 200) return [WORK, CARRY, MOVE];
    return [WORK, CARRY, MOVE];
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
    } else {
      // Find active source - make sure we use FIND_SOURCES if no active source found
      source = creep.pos.findClosestByPath(FIND_SOURCES_ACTIVE) || 
               creep.pos.findClosestByPath(FIND_SOURCES);
      
      // Save the source ID for future reference
      if (source) {
        creep.memory.targetSourceId = source.id;
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