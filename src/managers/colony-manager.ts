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
    // Only proceed if we have room for expansion (up to 4 rooms)
    if (this.roomsByType.owned.length >= 4) return;

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
    const potentialTargets: { roomName: string, score: number }[] = [];

    // Look at scouted rooms for potential targets
    for (const roomName of this.roomsByType.scouted) {
      // Skip rooms that are already targets
      if (Memory.colony.expansionTargets.includes(roomName)) continue;

      // Get the room if we have visibility
      const room = Game.rooms[roomName];
      if (!room) continue;

      // Evaluate the room
      const score = ScoutHelper.evaluateRoom(room);

      // If score is above threshold, add to potential targets
      if (score >= 50) {
        potentialTargets.push({ roomName, score });
      }
    }

    // Find new rooms to scout if we don't have enough potential targets
    if (potentialTargets.length < 3 && Game.time % 500 === 0) {
      // Get a list of rooms to scout from current owned rooms
      for (const roomName of this.roomsByType.owned) {
        const candidates = ScoutHelper.findExpansionCandidates(roomName);

        // Filter out rooms we've already scouted
        const newRooms = candidates.filter(r =>
          !this.roomsByType.scouted.includes(r) &&
          !this.roomsByType.owned.includes(r) &&
          !this.roomsByType.reserved.includes(r)
        );

        // Add new rooms to scout list with closest owned room info
        for (const newRoom of newRooms) {
          if (!Memory.roomData[newRoom]) {
            Memory.roomData[newRoom] = {
              ownedRoom: false,
              reservedRoom: false,
              lastSeen: 0
            } as any;
          }
        }

        Logger.info(`Found ${newRooms.length} new rooms to scout from ${roomName}`);
      }
    }

    // Sort potential targets by score (highest first)
    potentialTargets.sort((a, b) => b.score - a.score);

    // Add new targets to the expansion list
    if (potentialTargets.length > 0) {
      // Add up to 2 new targets
      for (let i = 0; i < Math.min(2, potentialTargets.length); i++) {
        const target = potentialTargets[i].roomName;
        if (!Memory.colony.expansionTargets.includes(target)) {
          Memory.colony.expansionTargets.push(target);
          Logger.info(`Added ${target} as expansion target with score ${potentialTargets[i].score}`);
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
    };
  }
}