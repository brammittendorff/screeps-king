/**
 * Scout Helper
 * Provides utilities for scouting and room evaluation
 */

import { Logger } from './logger';
import * as _ from 'lodash';

export class ScoutHelper {
  /**
   * Find candidate rooms for expansion
   */
  public static findExpansionCandidates(fromRoom: string): string[] {
    const candidates: string[] = [];
    
    // Get exits from current room
    const exits = Game.map.describeExits(fromRoom);
    
    // Recursively explore up to 3 rooms away
    this.exploreExits(fromRoom, exits, candidates, 3);
    
    return candidates;
  }
  
  /**
   * Recursively explore exits up to a certain depth
   */
  private static exploreExits(
    roomName: string, 
    exits: {[key: string]: string}, 
    candidates: string[], 
    depthLeft: number
  ): void {
    if (depthLeft <= 0) return;
    
    for (const direction in exits) {
      const nextRoom = exits[direction];
      
      // Skip if we've already added this room
      if (candidates.includes(nextRoom)) continue;
      
      // Skip if it's an owned room
      if (this.isRoomOwned(nextRoom)) continue;
      
      // Add to candidates
      candidates.push(nextRoom);
      
      // Recursively check next rooms
      const nextExits = Game.map.describeExits(nextRoom);
      this.exploreExits(nextRoom, nextExits, candidates, depthLeft - 1);
    }
  }
  
  /**
   * Check if a room is owned by any player
   */
  private static isRoomOwned(roomName: string): boolean {
    // Check if we have memory information about this room
    if (Memory.roomData && Memory.roomData[roomName]) {
      return Memory.roomData[roomName].ownedRoom;
    }
    
    // If we have visibility, check directly
    if (Game.rooms[roomName]) {
      const room = Game.rooms[roomName];
      return room.controller && room.controller.owner !== undefined;
    }
    
    // Default to unknown (we'll scout to find out)
    return false;
  }
  
  /**
   * Evaluate a room for expansion potential
   */
  public static evaluateRoom(room: Room): number {
    try {
      let score = 0;
      
      // Check for controller
      if (!room.controller) {
        return 0; // No controller, can't claim
      }
      
      // Check if already owned or reserved
      if (room.controller.owner || room.controller.reservation) {
        return 0; // Already claimed or reserved
      }
      
      // Count sources (more is better)
      const sources = room.find(FIND_SOURCES);
      score += sources.length * 20;
      
      // Check for minerals
      const minerals = room.find(FIND_MINERALS);
      for (const mineral of minerals) {
        // Add bonus for rare minerals
        switch (mineral.mineralType) {
          case RESOURCE_CATALYST:
            score += 15;
            break;
          case RESOURCE_HYDROGEN:
          case RESOURCE_OXYGEN:
          case RESOURCE_UTRIUM:
          case RESOURCE_LEMERGIUM:
          case RESOURCE_KEANIUM:
          case RESOURCE_ZYNTHIUM:
            score += 10;
            break;
          default:
            score += 5;
        }
      }
      
      // Check terrain openness
      const terrain = new Room.Terrain(room.name);
      let openTiles = 0;
      let wallTiles = 0;
      
      // Sample tiles throughout the room
      for (let x = 2; x < 48; x += 4) {
        for (let y = 2; y < 48; y += 4) {
          if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
            wallTiles++;
          } else {
            openTiles++;
          }
        }
      }
      
      // Calculate openness ratio (0-100)
      const opennessRatio = Math.floor((openTiles / (openTiles + wallTiles)) * 100);
      score += opennessRatio / 2; // 0-50 points for openness
      
      // Check distance to sources from controller
      let avgDistance = 0;
      if (sources.length > 0) {
        let totalDistance = 0;
        for (const source of sources) {
          const path = room.findPath(room.controller.pos, source.pos, { ignoreCreeps: true });
          totalDistance += path.length;
        }
        avgDistance = totalDistance / sources.length;
        
        // Shorter distances are better (max 25 points)
        score += Math.max(0, 25 - avgDistance);
      }
      
      // Check for hostiles
      const hostiles = room.find(FIND_HOSTILE_CREEPS);
      if (hostiles.length > 0) {
        // Penalize rooms with hostiles
        score -= hostiles.length * 10;
      }
      
      return Math.max(0, score);
    } catch (e) {
      Logger.error(`Error evaluating room ${room.name}: ${e}`);
      return 0;
    }
  }
  
  /**
   * Check distance between rooms (linear distance)
   */
  public static getRoomDistance(roomName1: string, roomName2: string): number {
    return Game.map.getRoomLinearDistance(roomName1, roomName2);
  }
  
  /**
   * Find the closest owned room to a target room
   */
  public static findClosestOwnedRoom(targetRoom: string): string | null {
    if (!Memory.colony || !Memory.colony.rooms || !Memory.colony.rooms.owned) {
      return null;
    }
    
    const ownedRooms = Memory.colony.rooms.owned;
    if (ownedRooms.length === 0) return null;
    
    // If only one owned room, return that
    if (ownedRooms.length === 1) return ownedRooms[0];
    
    // Find closest by linear distance
    let closestRoom = ownedRooms[0];
    let closestDistance = this.getRoomDistance(targetRoom, closestRoom);
    
    for (const room of ownedRooms.slice(1)) {
      const distance = this.getRoomDistance(targetRoom, room);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestRoom = room;
      }
    }
    
    return closestRoom;
  }
}