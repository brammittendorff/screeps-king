import { Logger } from '../utils/logger';
import { RoomCache } from '../utils/room-cache';

export class ScoutAI {
  /**
   * Main task method for scout creeps
   */
  public static task(creep: Creep): void {
    // 1. If we have a targetRoom and not there, move there
    if (creep.memory.targetRoom && creep.room.name !== creep.memory.targetRoom) {
      const exitDir = Game.map.findExit(creep.room, creep.memory.targetRoom);
      if (exitDir !== ERR_NO_PATH) {
        const exit = creep.pos.findClosestByRange(exitDir as FindConstant);
        if (exit) {
          creep.moveTo(exit, { visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 }, reusePath: 5 });
        }
      }
      return;
    }
    // 2. If in target room, visit points of interest
    if (creep.memory.targetRoom && creep.room.name === creep.memory.targetRoom) {
      const pointsOfInterest: RoomPosition[] = [];
      if (creep.room.controller) pointsOfInterest.push(creep.room.controller.pos);
      const sources = RoomCache.get(creep.room, FIND_SOURCES);
      for (const source of sources) pointsOfInterest.push(source.pos);
      const minerals = RoomCache.get(creep.room, FIND_MINERALS);
      for (const mineral of minerals) pointsOfInterest.push(mineral.pos);
      if (pointsOfInterest.length === 0) {
        pointsOfInterest.push(
          new RoomPosition(25, 25, creep.room.name),
          new RoomPosition(10, 10, creep.room.name),
          new RoomPosition(10, 40, creep.room.name),
          new RoomPosition(40, 10, creep.room.name),
          new RoomPosition(40, 40, creep.room.name)
        );
      }
      const pointIndex = Game.time % pointsOfInterest.length;
      const targetPos = pointsOfInterest[pointIndex];
      creep.moveTo(targetPos, { visualizePathStyle: { stroke: '#ffffff', opacity: 0.3 }, reusePath: 5 });
      // Mark as scouted in memory
      if (!Memory.roomData[creep.room.name]) {
        Memory.roomData[creep.room.name] = { ownedRoom: false, reservedRoom: false, lastSeen: Game.time } as any;
      } else {
        Memory.roomData[creep.room.name].lastSeen = Game.time;
      }
      // Mark as scouted in parent room's adjacentRooms if applicable
      for (const myRoomName in Game.rooms) {
        const myRoom = Game.rooms[myRoomName];
        if (myRoom.memory.adjacentRooms && myRoom.memory.adjacentRooms[creep.room.name]) {
          myRoom.memory.adjacentRooms[creep.room.name].status = 'scouted';
        }
      }
      return;
    }
    // 3. If no targetRoom, pick an unexplored adjacent room or expansion target
    const homeRoom = Game.rooms[creep.memory.homeRoom || creep.room.name];
    if (homeRoom && homeRoom.memory.adjacentRooms) {
      for (const adjRoom in homeRoom.memory.adjacentRooms) {
        if (homeRoom.memory.adjacentRooms[adjRoom].status === 'unexplored') {
          creep.memory.targetRoom = adjRoom;
          creep.say(`Scout: ${adjRoom}`);
          return;
        }
      }
    }
    // Fallback: pick an expansion target
    if (Memory.colony && Memory.colony.expansionTargets && Memory.colony.expansionTargets.length > 0) {
      for (const target of Memory.colony.expansionTargets) {
        if (!Memory.roomData[target] || (Game.time - (Memory.roomData[target].lastSeen || 0) > 10000)) {
          creep.memory.targetRoom = target;
          creep.say(`Scout: ${target}`);
          return;
        }
      }
    }
    // If nothing to do, idle at spawn or center
    let spawns = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter(
      (s) => s.structureType === STRUCTURE_SPAWN && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (spawns.length > 0) {
      if (creep.transfer(spawns[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(spawns[0], { reusePath: 10 });
      }
      return;
    }
    let extensions = RoomCache.get(creep.room, FIND_MY_STRUCTURES).filter(
      (s) => s.structureType === STRUCTURE_EXTENSION && s.store.getFreeCapacity(RESOURCE_ENERGY) > 0
    );
    if (extensions.length > 0) {
      if (creep.transfer(extensions[0], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
        creep.moveTo(extensions[0], { reusePath: 10 });
      }
      return;
    }
    const spawn = RoomCache.get(creep.room, FIND_MY_SPAWNS)[0];
    if (spawn) {
      creep.moveTo(spawn, { range: 3, reusePath: 10 });
    } else {
      creep.moveTo(25, 25, { reusePath: 10 });
    }
  }
} 