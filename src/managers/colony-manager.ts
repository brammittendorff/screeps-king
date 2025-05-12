import { getRoomCache, getRoomData } from './room-manager';
import { Logger } from '../utils/logger';
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
    scouted: Record<string, ScoutedRoomMemory>;
  } = {
    owned: [],
    reserved: [],
    scouted: {}
  };

  // Colony-wide resource allocation
  private static resourceBalance: { [resource: string]: { [roomName: string]: number } } = {};

  // Analytics: track expansion attempts, successes, failures
  private static expansionStats: { attempts: number; successes: number; failures: number } = { attempts: 0, successes: 0, failures: 0 };

  /**
   * Initialize colony data
   */
  public static init(): void {
    // Reset colony data
    this.roomsByType = {
      owned: [],
      reserved: [],
      scouted: {}
    };
    
    this.resourceBalance = {};
    
    // Populate room lists from Memory
    if (!Memory.colony) {
      Memory.colony = {
        rooms: {
          owned: [],
          reserved: [],
          scouted: {}
        },
        resourceBalance: {},
        expansionTargets: [],
        version: 1
      };
    }
    
    // Update from memory
    this.roomsByType.owned = Memory.colony.rooms.owned || [];
    this.roomsByType.reserved = Memory.colony.rooms.reserved || [];
    this.roomsByType.scouted = Memory.colony.rooms.scouted || {};
  }

  /**
   * Run the colony management logic
   */
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
    if (!Memory.colony.expansionTargets || Object.keys(Memory.colony.expansionTargets).length === 0) {
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
      Object.keys(Memory.colony.expansionTargets).includes(c.memory.targetRoom)
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

    // Track expansion attempt
    this.expansionStats.attempts++;

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
    if (!Memory.colony.expansionTargets || Object.keys(Memory.colony.expansionTargets).length === 0) {
      return null;
    }

    // Use the first target as default
    let bestTarget = Object.keys(Memory.colony.expansionTargets)[0];
    let bestScore = 0;

    // Check each target and score it
    for (const roomName of Object.keys(Memory.colony.expansionTargets)) {
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
    for (const roomName in getRoomCache()) {
      const roomData = getRoomData(roomName);
      
      if (roomData.ownedRoom) {
        this.roomsByType.owned.push(roomName);
      } else if (roomData.reservedRoom) {
        this.roomsByType.reserved.push(roomName);
      } else if (roomData.lastSeen > 0 && Game.rooms[roomName]) { // Only add if currently visible
        this.roomsByType.scouted[roomName] = { lastSeen: roomData.lastSeen };
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
   * Plan colony expansion (automated, robust, tunable)
   */
  private static planExpansion(): void {
    // --- Expansion scoring weights (tune here) ---
    const WEIGHT_SOURCES = 100;
    const WEIGHT_MINERAL = 1; // already weighted below
    const WEIGHT_SAFE = 50;
    const WEIGHT_DISTANCE = 5; // closer = higher score
    const WEIGHT_ENEMY_BORDER = -100;
    const WEIGHT_HIGHWAY = -50;
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
    // Only proceed if we have room for expansion (GCL limit)
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
    // --- Automated Expansion Target Selection ---
    // 1. Gather all scouted rooms not owned/reserved/targeted
    const potentialTargets: { roomName: string, score: number, sources: number, mineral: string, safe: boolean, distance: number }[] = [];
    const myCoreRoom = this.roomsByType.owned[0]; // Use first owned room as core
    for (const roomName in Memory.roomData) {
      const data = Memory.roomData[roomName];
      if (!data || data.ownedRoom || data.reservedRoom) continue;
      // Skip if already a target
      if (Memory.colony.expansionTargets && Memory.colony.expansionTargets.includes(roomName)) continue;
      // Only consider rooms we've seen recently
      if (!data.lastSeen || Game.time - data.lastSeen > 5000) continue;
      // Evaluate safety: no strong enemy, not a highway, not a source keeper
      const isHighway = /^.*[0|5]$/.test(roomName);
      const isSourceKeeper = /^[WE][0-9][3|6][NS][0-9][3|6]$/.test(roomName);
      const safe = (!data.owner && (!data.hostileCount || data.hostileCount < 2)) && !isHighway && !isSourceKeeper;
      // Prefer 2-source rooms
      const sources = data.sources ? data.sources.length : 0;
      // Prefer rare minerals
      const mineral = data.minerals && data.minerals[0] ? data.minerals[0].mineralType : '';
      let mineralScore = 0;
      if (mineral === RESOURCE_CATALYST) mineralScore = 30;
      else if (mineral === RESOURCE_ZYNTHIUM || mineral === RESOURCE_KEANIUM) mineralScore = 20;
      else if (mineral === RESOURCE_UTRIUM || mineral === RESOURCE_LEMERGIUM) mineralScore = 15;
      else if (mineral === RESOURCE_HYDROGEN || mineral === RESOURCE_OXYGEN) mineralScore = 5;
      // Distance from core room
      let distance = 10;
      if (myCoreRoom) {
        distance = Game.map.getRoomLinearDistance(myCoreRoom, roomName);
      }
      // Penalize rooms adjacent to strong enemies (owner present)
      let enemyBorderPenalty = 0;
      const exits = Game.map.describeExits(roomName);
      for (const dir in exits) {
        const adjRoom = exits[dir];
        const adjData = Memory.roomData[adjRoom];
        if (adjData && adjData.owner && adjData.owner !== 'Invader') {
          enemyBorderPenalty += WEIGHT_ENEMY_BORDER;
        }
      }
      // Penalize highways
      const highwayPenalty = isHighway ? WEIGHT_HIGHWAY : 0;
      // Score: sources, mineral, safety, distance, enemy border, highway
      const score = (sources * WEIGHT_SOURCES) + (mineralScore * WEIGHT_MINERAL) + (safe ? WEIGHT_SAFE : 0) + (Math.max(0, 20 - distance) * WEIGHT_DISTANCE) + enemyBorderPenalty + highwayPenalty;
      potentialTargets.push({ roomName, score, sources, mineral, safe, distance });
    }
    // 2. Sort by score, prefer safe, 2-source, rare mineral, close rooms
    potentialTargets.sort((a, b) => b.score - a.score);
    // 3. Add top targets to expansionTargets
    if (!Memory.colony.expansionTargets) Memory.colony.expansionTargets = [];
    for (const target of potentialTargets) {
      if (Memory.colony.expansionTargets.length >= 2) break;
      Memory.colony.expansionTargets.push(target.roomName);
      Logger.info(`[ColonyManager] Added expansion target: ${target.roomName} (score: ${target.score}, sources: ${target.sources}, mineral: ${target.mineral}, safe: ${target.safe}, distance: ${target.distance})`);
    }
    // 4. Remove invalid/claimed targets
    Memory.colony.expansionTargets = Memory.colony.expansionTargets.filter(roomName => {
      const data = Memory.roomData[roomName];
      return data && !data.ownedRoom && !data.reservedRoom;
    });
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
  public static getRoomsByType(): { owned: string[], reserved: string[], scouted: Record<string, ScoutedRoomMemory> } {
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
    return Object.keys(Memory.colony.expansionTargets) || [];
  }

  /**
   * Call this when an expansion is successful (room claimed)
   */
  public static markExpansionSuccess(): void {
    this.expansionStats.successes++;
  }

  /**
   * Call this when an expansion fails (claimer lost, etc.)
   */
  public static markExpansionFailure(): void {
    this.expansionStats.failures++;
  }

  /**
   * Get expansion analytics
   */
  public static getExpansionStats(): { attempts: number; successes: number; failures: number } {
    return { ...this.expansionStats };
  }

  /**
   * Cross-room resource support: modular hook for future AI/task integration
   */
  public static crossRoomSupport(): void {
    // Future: call AI/task system for cross-room hauler/energy support
  }

  /**
   * Clean up colony memory for rooms that no longer exist or are not visible for a long time
   */
  public static cleanup(): void {
    if (Memory.colony) {
      // Prune owned, reserved, scouted rooms
      ['owned', 'reserved', 'scouted'].forEach((type) => {
        if (Memory.colony.rooms && Memory.colony.rooms[type]) {
          Memory.colony.rooms[type] = Object.keys(Memory.colony.rooms[type]).filter((roomName: string) => Game.rooms[roomName]);
        }
      });
      // Prune expansionTargets for rooms that are not normal or not seen for a long time
      if (Memory.colony.expansionTargets) {
        Memory.colony.expansionTargets = Object.keys(Memory.colony.expansionTargets).filter((roomName: string) => {
          const status = Game.map.getRoomStatus(roomName).status;
          const lastSeen = Memory.roomData && Memory.roomData[roomName] && Memory.roomData[roomName].lastSeen;
          return status === 'normal' && (!lastSeen || Game.time - lastSeen < 20000);
        });
      }
    }
  }
}

// Extend Memory interface for colony data
declare global {
  interface Memory {
    colony: {
      rooms: {
        owned: string[];
        reserved: string[];
        scouted: Record<string, ScoutedRoomMemory>;
      };
      resourceBalance: { [resource: string]: { [roomName: string]: number } };
      expansionTargets: string[];
      version: number;
      lostRooms?: { roomName: string; time: number }[];
    };
  }
}