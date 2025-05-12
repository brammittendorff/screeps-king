import { RoomManager } from './room-manager';
import { Logger } from '../utils/logger';
import { Profiler } from '../utils/profiler';
import { ScoutHelper } from '../utils/scout-helper';
import * as _ from 'lodash';

/**
 * ColonyManager handles coordination between multiple rooms
 * It manages resource distribution, expansion strategy, and defense
 */
export class ColonyManager {
  // Track rooms by type for efficient management
  private static roomsByType: {
    owned: string[];
    reserved: string[];
    scouted: string[];
  } = {
    owned: [],
    reserved: [],
    scouted: []
  };

  // Colony-wide resource allocation
  private static resourceBalance: { [resource: string]: { [roomName: string]: number } } = {};

  /**
   * Initialize colony data
   */
  public static init(): void {
    // Reset colony data
    this.roomsByType = {
      owned: [],
      reserved: [],
      scouted: []
    };
    
    this.resourceBalance = {};
    
    // Populate room lists from Memory
    if (!Memory.colony) {
      Memory.colony = {
        rooms: {
          owned: [],
          reserved: [],
          scouted: []
        },
        resourceBalance: {},
        expansionTargets: [],
        version: 1
      };
    }
    
    // Update from memory
    this.roomsByType.owned = Memory.colony.rooms.owned || [];
    this.roomsByType.reserved = Memory.colony.rooms.reserved || [];
    this.roomsByType.scouted = Memory.colony.rooms.scouted || [];
  }

  /**
   * Run the colony management logic
   */
  @Profiler.wrap('ColonyManager.run')
  public static run(): void {
    try {
      // Update colony status from RoomManager data
      this.updateColonyStatus();

      // Balance resources between rooms if we have multiple owned rooms
      if (this.roomsByType.owned.length > 1) {
        this.balanceResources();
      }

      // Plan expansion if we're ready
      if (Game.time % 100 === 0) {
        this.planExpansion();
      }

      // Check if we need to send claimers to expansion targets
      if (Game.time % 200 === 0) {
        this.processExpansionClaiming();
      }

      // Save colony state to memory
      this.saveToMemory();
    } catch (e) {
      Logger.error(`Error in ColonyManager.run: ${e}`);
    }
  }

  /**
   * Process the claiming of expansion targets
   */
  private static processExpansionClaiming(): void {
    // Skip if no expansion targets
    if (!Memory.colony.expansionTargets || Memory.colony.expansionTargets.length === 0) {
      return;
    }

    // Check if we're ready to expand (GCL > owned rooms)
    if (Game.gcl.level <= this.roomsByType.owned.length) {
      // Not ready to expand yet
      return;
    }

    // Check if we have resources to expand (need at least one room with storage)
    let hasResources = false;
    let bestSourceRoom = '';
    let bestRoomEnergy = 0;

    for (const roomName of this.roomsByType.owned) {
      const room = Game.rooms[roomName];
      if (!room) continue;

      // Check if the room has storage with energy
      if (room.storage && room.storage.store[RESOURCE_ENERGY] > 20000) {
        hasResources = true;

        // Find room with the most energy
        if (room.storage.store[RESOURCE_ENERGY] > bestRoomEnergy) {
          bestRoomEnergy = room.storage.store[RESOURCE_ENERGY];
          bestSourceRoom = roomName;
        }
      }
    }

    if (!hasResources || !bestSourceRoom) {
      return; // Not enough resources to expand
    }

    // Check if we already have a claimer en route
    const existingClaimers = _.filter(Game.creeps, (c) =>
      c.memory.role === 'claimer' &&
      Memory.colony.expansionTargets.includes(c.memory.targetRoom)
    );

    if (existingClaimers.length > 0) {
      return; // Already have a claimer headed to an expansion target
    }

    // Get the best target to claim
    const targetRoom = this.getBestExpansionTarget();
    if (!targetRoom) return;

    // Request a claimer
    const room = Game.rooms[bestSourceRoom];
    if (!room) return;

    // Check creep limit
    const creepCount = Object.keys(Game.creeps).length;
    if (creepCount >= Game.gcl.level * 10 + 10) {
      return; // Too many creeps, wait until some die off
    }

    // Import CreepManager dynamically to avoid circular dependency
    const CreepManager = require('./creep-manager').CreepManager;
    const body = CreepManager.getOptimalBody(CreepManager.CreepRole.Claimer, room.energyCapacityAvailable);

    CreepManager.requestCreep({
      role: CreepManager.CreepRole.Claimer,
      body: body,
      priority: 80, // High priority
      roomName: bestSourceRoom,
      memory: {
        role: CreepManager.CreepRole.Claimer,
        homeRoom: bestSourceRoom,
        targetRoom: targetRoom
      }
    });

    Logger.info(`Requested claimer for room ${targetRoom} from ${bestSourceRoom}`, 'ColonyManager');
  }

  /**
   * Get the best expansion target based on scoring
   */
  private static getBestExpansionTarget(): string | null {
    if (!Memory.colony.expansionTargets || Memory.colony.expansionTargets.length === 0) {
      return null;
    }

    // Use the first target as default
    let bestTarget = Memory.colony.expansionTargets[0];
    let bestScore = 0;

    // Check each target and score it
    for (const roomName of Memory.colony.expansionTargets) {
      let score = 0;

      // Base score from room evaluation
      if (Memory.roomData[roomName] && Memory.roomData[roomName].expansionScore) {
        score += Memory.roomData[roomName].expansionScore;
      }

      // Distance from existing rooms (prefer closer)
      const closestOwnedRoom = ScoutHelper.findClosestOwnedRoom(roomName);
      if (closestOwnedRoom) {
        const distance = ScoutHelper.getRoomDistance(roomName, closestOwnedRoom);
        score += Math.max(0, 10 - distance) * 10; // 0-100 points for proximity
      }

      // Visibility (prefer rooms we can see)
      if (Game.rooms[roomName]) {
        score += 50; // Big bonus for visibility
      }

      // Update best target
      if (score > bestScore) {
        bestScore = score;
        bestTarget = roomName;
      }
    }

    return bestTarget;
  }

  /**
   * Update the colony status based on current game state
   */
  private static updateColonyStatus(): void {
    // Reset room lists
    this.roomsByType.owned = [];
    this.roomsByType.reserved = [];
    
    // Get data from RoomManager
    for (const roomName in RoomManager.getRoomCache()) {
      const roomData = RoomManager.getRoomData(roomName);
      
      if (roomData.ownedRoom) {
        this.roomsByType.owned.push(roomName);
      } else if (roomData.reservedRoom) {
        this.roomsByType.reserved.push(roomName);
      } else if (roomData.lastSeen > 0) {
        // Only add to scouted if we've actually seen it
        this.roomsByType.scouted.push(roomName);
      }
    }
    
    // Update resource balance data
    this.updateResourceData();
  }

  /**
   * Update resource balance information across rooms
   */
  private static updateResourceData(): void {
    // Reset resource data
    this.resourceBalance = {};
    
    // Only check visible rooms
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      
      // Skip rooms we don't own
      if (!room.controller || !room.controller.my) continue;
      
      // Initialize resource entry
      if (!this.resourceBalance[RESOURCE_ENERGY]) {
        this.resourceBalance[RESOURCE_ENERGY] = {};
      }
      
      // Calculate total energy in the room including storage
      let totalEnergy = 0;
      
      // Storage energy
      if (room.storage) {
        totalEnergy += room.storage.store[RESOURCE_ENERGY] || 0;
      }
      
      // Terminal energy
      if (room.terminal) {
        totalEnergy += room.terminal.store[RESOURCE_ENERGY] || 0;
      }
      
      // Container energy
      const containers = room.find(FIND_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_CONTAINER
      }) as StructureContainer[];
      
      for (const container of containers) {
        totalEnergy += container.store[RESOURCE_ENERGY] || 0;
      }
      
      // Store the total
      this.resourceBalance[RESOURCE_ENERGY][roomName] = totalEnergy;
    }
  }

  /**
   * Balance resources between rooms
   */
  private static balanceResources(): void {
    // Only proceed if we have energy data
    if (!this.resourceBalance[RESOURCE_ENERGY]) return;
    
    const roomsWithEnergy = Object.keys(this.resourceBalance[RESOURCE_ENERGY]);
    if (roomsWithEnergy.length <= 1) return;
    
    // Calculate average energy per room
    let totalEnergy = 0;
    for (const roomName of roomsWithEnergy) {
      totalEnergy += this.resourceBalance[RESOURCE_ENERGY][roomName];
    }
    
    const avgEnergy = totalEnergy / roomsWithEnergy.length;
    
    // Find rooms with too much or too little energy
    const surplusRooms: string[] = [];
    const deficitRooms: string[] = [];
    
    for (const roomName of roomsWithEnergy) {
      const roomEnergy = this.resourceBalance[RESOURCE_ENERGY][roomName];
      const diff = roomEnergy - avgEnergy;
      
      // If the difference is significant (more than 10% of avg)
      if (diff > avgEnergy * 0.2) {
        surplusRooms.push(roomName);
      } else if (diff < -avgEnergy * 0.2) {
        deficitRooms.push(roomName);
      }
    }
    
    // Create transfer tasks for terminals if available
    for (const sourceRoom of surplusRooms) {
      // Only handle visible rooms with terminals
      if (!Game.rooms[sourceRoom] || !Game.rooms[sourceRoom].terminal) continue;
      
      for (const targetRoom of deficitRooms) {
        // Skip if it's the same room
        if (sourceRoom === targetRoom) continue;
        
        // Only handle visible rooms with terminals
        if (!Game.rooms[targetRoom] || !Game.rooms[targetRoom].terminal) continue;
        
        // Calculate amount to send (20% of surplus or maximum 10000)
        const sourceEnergy = this.resourceBalance[RESOURCE_ENERGY][sourceRoom];
        const targetEnergy = this.resourceBalance[RESOURCE_ENERGY][targetRoom];
        
        if (sourceEnergy > targetEnergy * 1.5) {
          const amount = Math.min(
            Math.floor((sourceEnergy - targetEnergy) * 0.3),
            10000
          );
          
          if (amount > 1000) {
            // Queue the terminal transfer
            const terminal = Game.rooms[sourceRoom].terminal;
            if (terminal && terminal.cooldown === 0) {
              terminal.send(RESOURCE_ENERGY, amount, targetRoom);
              Logger.info(`Sending ${amount} energy from ${sourceRoom} to ${targetRoom}`);
              
              // Update our local tracking to avoid multiple transfers
              this.resourceBalance[RESOURCE_ENERGY][sourceRoom] -= amount;
              if (Game.rooms[targetRoom]) {
                this.resourceBalance[RESOURCE_ENERGY][targetRoom] += amount;
              }
              
              // Only do one transfer per room per tick
              break;
            }
          }
        }
      }
    }
  }

  /**
   * Plan colony expansion
   */
  private static planExpansion(): void {
    // --- Dynamic Expansion Pausing ---
    // Pause if any owned room is under attack (recent hostiles)
    let underAttack = false;
    for (const roomName of this.roomsByType.owned) {
      const roomData = Memory.roomData[roomName];
      if (roomData && roomData.hostileTime && Game.time - roomData.hostileTime < 1000) {
        underAttack = true;
        break;
      }
    }
    // Pause if average storage energy is low
    let totalEnergy = 0, storageRooms = 0;
    for (const roomName of this.roomsByType.owned) {
      const room = Game.rooms[roomName];
      if (room && room.storage) {
        totalEnergy += room.storage.store[RESOURCE_ENERGY] || 0;
        storageRooms++;
      }
    }
    const avgEnergy = storageRooms > 0 ? totalEnergy / storageRooms : 0;
    // Pause if a room was lost in the last 10,000 ticks (roomData missing but was owned)
    let recentlyLostRoom = false;
    if (Memory.colony && Memory.colony.lostRooms) {
      for (const lost of Memory.colony.lostRooms) {
        if (Game.time - lost.time < 10000) {
          recentlyLostRoom = true;
          break;
        }
      }
    }
    if (underAttack || avgEnergy < 10000 || recentlyLostRoom) {
      Logger.info('Expansion paused: under attack, low energy, or recently lost a room.');
      return;
    }

    // Only proceed if we have room for expansion (up to 4 rooms)
    if (this.roomsByType.owned.length >= Game.gcl.level) return;

    // Check if we're ready to expand (all current rooms at RCL 4+)
    let readyToExpand = true;
    for (const roomName of this.roomsByType.owned) {
      const room = Game.rooms[roomName];
      if (room && room.controller && room.controller.level < 4) {
        readyToExpand = false;
        break;
      }
    }

    if (!readyToExpand) return;

    // We already have targets, evaluate their status
    if (Memory.colony.expansionTargets.length > 0) {
      // Refresh expansion targets list by removing invalid ones and keeping valid ones
      const validTargets: string[] = [];

      for (const targetRoom of Memory.colony.expansionTargets) {
        const room = Game.rooms[targetRoom];

        // If we can see the room, check if it's still a valid target
        if (room) {
          // Check if the room has a controller and it's not owned
          if (room.controller && !room.controller.owner && !room.controller.reservation) {
            // It's still a valid target
            validTargets.push(targetRoom);
          } else {
            Logger.info(`Removed ${targetRoom} from expansion targets: no longer available`);
          }
        } else {
          // We can't see the room, assume it's still valid
          validTargets.push(targetRoom);
        }
      }

      // Update expansion targets list
      Memory.colony.expansionTargets = validTargets;

      // If we still have enough targets, don't search for more
      if (validTargets.length >= 2) return;
    }

    // Find new potential expansion targets
    const potentialTargets: { roomName: string, score: number, sources: number }[] = [];

    // Look at scouted rooms for potential targets
    for (const roomName of this.roomsByType.scouted) {
      // Skip rooms that are already targets
      if (Memory.colony.expansionTargets.includes(roomName)) continue;

      // Get the room if we have visibility
      const room = Game.rooms[roomName];
      if (!room) continue;

      // Use advanced score if available
      let score = 0;
      let sources = 0;
      if (Memory.roomData[roomName] && typeof Memory.roomData[roomName].expansionScore === 'number') {
        score = Memory.roomData[roomName].expansionScore;
        sources = room.find(FIND_SOURCES).length;
      } else {
        score = ScoutHelper.evaluateRoom(room);
        sources = room.find(FIND_SOURCES).length;
      }

      // If score is above threshold, add to potential targets
      if (score >= 10) { // Lowered threshold to allow 1-source rooms if needed
        potentialTargets.push({ roomName, score, sources });
      }
    }

    // Prefer 2-source rooms, but allow 1-source if no 2-source available
    let bestTargets = potentialTargets.filter(t => t.sources === 2);
    if (bestTargets.length === 0) {
      bestTargets = potentialTargets.filter(t => t.sources === 1);
    }

    // Sort best targets by score (highest first)
    bestTargets.sort((a, b) => b.score - a.score);

    // Add new targets to the expansion list
    if (bestTargets.length > 0) {
      // Add up to 2 new targets
      for (let i = 0; i < Math.min(2, bestTargets.length); i++) {
        const target = bestTargets[i].roomName;
        if (!Memory.colony.expansionTargets.includes(target)) {
          Memory.colony.expansionTargets.push(target);
          Logger.info(`Added ${target} as expansion target with score ${bestTargets[i].score}`);
        }
      }
    }
  }

  /**
   * Save colony state to memory
   */
  private static saveToMemory(): void {
    Memory.colony.rooms.owned = this.roomsByType.owned;
    Memory.colony.rooms.reserved = this.roomsByType.reserved;
    Memory.colony.rooms.scouted = this.roomsByType.scouted;
    Memory.colony.resourceBalance = this.resourceBalance;
  }

  /**
   * Get all rooms in the colony by type
   */
  public static getRoomsByType(): { owned: string[], reserved: string[], scouted: string[] } {
    return this.roomsByType;
  }

  /**
   * Get energy balance across all rooms
   */
  public static getEnergyBalance(): { [roomName: string]: number } {
    return this.resourceBalance[RESOURCE_ENERGY] || {};
  }

  /**
   * Get expansion targets
   */
  public static getExpansionTargets(): string[] {
    return Memory.colony.expansionTargets || [];
  }
}

// Extend Memory interface for colony data
declare global {
  interface Memory {
    colony: {
      rooms: {
        owned: string[];
        reserved: string[];
        scouted: string[];
      };
      resourceBalance: { [resource: string]: { [roomName: string]: number } };
      expansionTargets: string[];
      version: number;
      lostRooms?: { roomName: string; time: number }[];
    };
  }
}