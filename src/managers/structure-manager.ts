/**
 * Structure Manager
 * Handles structure operations, maintenance, and monitoring
 */

import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import { Helpers } from '../utils/helpers';

declare global {
  interface RoomMemory {
    containerFlags?: { [id: string]: 'pickup' | 'refill' | undefined };
  }
}

export class StructureManager {
  /**
   * Run structure operations for all structures
   */
  @Profiler.wrap('StructureManager.runStructures')
  public static runStructures(): void {
    // Process structures by type for efficiency
    this.runSpawns();
    this.runTowers();
    this.runExtensions();
    this.runContainers();
    this.runLinks();
    this.runLabs();
    this.runObserver();
    
    // Run global structure controller if available
    if (global.controller && global.controller.structure && global.controller.structure.routine) {
      for (const id in Game.structures) {
        const structure = Game.structures[id];
        
        try {
          global.controller.structure.routine(structure);
        } catch (e) {
          Logger.error(`Error in structure routine for ${structure.id}: ${(e as Error).message}`);
        }
      }
    }
  }
  
  /**
   * Run spawns logic
   */
  private static runSpawns(): void {
    for (const name in Game.spawns) {
      const spawn = Game.spawns[name];
      
      try {
        // Visual indicator of spawning progress
        if (spawn.spawning) {
          const spawningCreep = Game.creeps[spawn.spawning.name];
          spawn.room.visual.text(
            '🛠️ ' + spawningCreep.memory.role,
            spawn.pos.x + 1,
            spawn.pos.y,
            { align: 'left', opacity: 0.8 }
          );
        }
        
        // Other spawn logic as needed
      } catch (e) {
        Logger.error(`Error running spawn ${name}: ${(e as Error).message}`);
      }
    }
  }
  
  /**
   * Run towers logic
   */
  private static runTowers(): void {
    // Find all towers
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      
      if (structure.structureType === STRUCTURE_TOWER) {
        const tower = structure as StructureTower;
        
        try {
          // Run tower AI if available
          if (global.ai.tower && global.ai.tower.task) {
            global.ai.tower.task(tower);
          } else {
            // Fallback tower logic
            this.defaultTowerLogic(tower);
          }
        } catch (e) {
          Logger.error(`Error running tower ${id}: ${(e as Error).message}`);
        }
      }
    }
  }
  
  /**
   * Default tower logic if the AI module is not available
   */
  private static defaultTowerLogic(tower: StructureTower): void {
    // Prioritize healing, then attack, then repair
    const closestDamagedCreep = tower.pos.findClosestByRange(FIND_MY_CREEPS, {
      filter: (creep) => creep.hits < creep.hitsMax
    });
    
    if (closestDamagedCreep) {
      tower.heal(closestDamagedCreep);
      return;
    }
    
    const closestHostile = tower.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
      tower.attack(closestHostile);
      return;
    }
    
    // Only repair if tower has > 50% energy
    if (tower.store.getUsedCapacity(RESOURCE_ENERGY) > tower.store.getCapacity(RESOURCE_ENERGY) * 0.5) {
      const closestDamagedStructure = tower.pos.findClosestByRange(FIND_STRUCTURES, {
        filter: (s) => s.hits < s.hitsMax && 
                      s.hits < 10000 && // Don't fully repair walls/ramparts
                      s.structureType !== STRUCTURE_WALL && 
                      s.structureType !== STRUCTURE_RAMPART
      });
      
      if (closestDamagedStructure) {
        tower.repair(closestDamagedStructure);
      }
    }
  }
  
  /**
   * Run extensions logic
   */
  private static runExtensions(): void {
    // Extensions don't generally need active logic
    // This is mostly a placeholder for future functionality
  }
  
  /**
   * Run containers logic (advanced)
   */
  private static runContainers(): void {
    // Track containers by role and fill status
    if (!Memory.containers) Memory.containers = {};
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      if (structure.structureType === STRUCTURE_CONTAINER) {
        const container = structure as StructureContainer;
        // Detect role: harvest (near source), upgrade (near controller), buffer (near storage), or other
        let role = 'other';
        if (container.pos.findInRange(FIND_SOURCES, 1).length > 0) role = 'harvest';
        else if (container.pos.findInRange(FIND_STRUCTURES, 1, { filter: s => s.structureType === STRUCTURE_CONTROLLER }).length > 0) role = 'upgrade';
        else if (container.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_STORAGE }).length > 0) role = 'buffer';
        // Store in memory
        Memory.containers[id] = {
          id,
          room: container.room.name,
          role,
          lastTick: Game.time,
          fill: container.store[RESOURCE_ENERGY] || 0,
          capacity: container.store.getCapacity(RESOURCE_ENERGY)
        };
        // Flag for pickup/refill
        if (!container.room.memory.containerFlags) container.room.memory.containerFlags = {};
        if (role === 'harvest' && container.store.getFreeCapacity(RESOURCE_ENERGY) < 100) {
          container.room.memory.containerFlags[id] = 'pickup';
        } else if (role === 'upgrade' && container.store[RESOURCE_ENERGY] < 200) {
          container.room.memory.containerFlags[id] = 'refill';
        } else {
          container.room.memory.containerFlags[id] = undefined;
        }
      }
    }
  }
  
  /**
   * Run links logic (advanced)
   */
  private static runLinks(): void {
    if (!Memory.links) Memory.links = {};
    // First, classify links by role
    const links: StructureLink[] = [];
    for (const id in Game.structures) {
      const structure = Game.structures[id];
      if (structure.structureType === STRUCTURE_LINK) {
        const link = structure as StructureLink;
        links.push(link);
        // Detect role: source (near source), storage (near storage), controller (near controller), relay (other)
        let role = 'relay';
        if (link.pos.findInRange(FIND_SOURCES, 2).length > 0) role = 'source';
        else if (link.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_STORAGE }).length > 0) role = 'storage';
        else if (link.pos.findInRange(FIND_STRUCTURES, 2, { filter: s => s.structureType === STRUCTURE_CONTROLLER }).length > 0) role = 'controller';
        Memory.links[id] = {
          id,
          room: link.room.name,
          role,
          lastTick: Game.time,
          energy: link.store[RESOURCE_ENERGY] || 0,
          cooldown: link.cooldown
        };
      }
    }
    // Now, transfer logic: source → storage/controller/relay, relay → storage/controller
    const sources = links.filter(l => Memory.links[l.id].role === 'source');
    const storages = links.filter(l => Memory.links[l.id].role === 'storage');
    const controllers = links.filter(l => Memory.links[l.id].role === 'controller');
    const relays = links.filter(l => Memory.links[l.id].role === 'relay');
    for (const source of sources) {
      if (source.cooldown === 0 && source.store[RESOURCE_ENERGY] > 0) {
        // Prefer storage, then controller, then relay
        let target: StructureLink | undefined = storages.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (!target) target = controllers.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (!target) target = relays.find(l => l.room.name === source.room.name && l.id !== source.id && l.cooldown === 0);
        if (target) {
          source.transferEnergy(target);
          Memory.links[source.id].lastTransfer = Game.time;
          Memory.links[target.id].lastReceive = Game.time;
        }
      }
    }
    // Relay links: transfer to storage/controller if full
    for (const relay of relays) {
      if (relay.cooldown === 0 && relay.store[RESOURCE_ENERGY] > 0) {
        let target: StructureLink | undefined = storages.find(l => l.room.name === relay.room.name && l.id !== relay.id && l.cooldown === 0);
        if (!target) target = controllers.find(l => l.room.name === relay.room.name && l.id !== relay.id && l.cooldown === 0);
        if (target) {
          relay.transferEnergy(target);
          Memory.links[relay.id].lastTransfer = Game.time;
          Memory.links[target.id].lastReceive = Game.time;
        }
      }
    }
  }
  
  /**
   * Run labs logic
   */
  private static runLabs(): void {
    // For now, this is a placeholder for future lab management
  }
  
  /**
   * Run observer logic
   */
  private static runObserver(): void {
    // For now, this is a placeholder for future observer management
  }
  
  /**
   * Check if a structure needs repair
   */
  public static needsRepair(structure: Structure, urgentOnly: boolean = false): boolean {
    // Different thresholds for different structure types
    let threshold = 0;
    
    switch (structure.structureType) {
      case STRUCTURE_WALL:
        threshold = urgentOnly ? 0.001 : 0.0001;
        break;
      case STRUCTURE_RAMPART:
        threshold = urgentOnly ? 0.1 : 0.01;
        break;
      case STRUCTURE_CONTAINER:
        threshold = urgentOnly ? 0.3 : 0.7;
        break;
      case STRUCTURE_ROAD:
        threshold = urgentOnly ? 0.3 : 0.7;
        break;
      default:
        threshold = urgentOnly ? 0.5 : 0.8;
    }
    
    return structure.hits < structure.hitsMax * threshold;
  }
}