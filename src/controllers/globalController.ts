import { MemoryManager } from '../managers/memory-manager';
import { AI } from '../ai';
import { Logger } from '../utils/logger';
import { RoomManager } from '../managers/room-manager';

export const globalController = {
  memory: {
    updateByCreep: (creep: Creep) => {
      if (!creep.memory.version || creep.memory.version < global.config.version) {
        MemoryManager.initCreepMemory(creep, creep.memory.role);
      }
    },
    initCreep: (creep: Creep) => {
      MemoryManager.initCreepMemory(creep, creep.memory.role);
    },
    updateByRoom: (room: Room) => {
      MemoryManager.updateRoomMemory(room);
    },
    initRoom: (room: Room) => {
      MemoryManager.initRoomMemory(room);
    }
  },
  creep: {
    routine: (creep: Creep) => {
      const role = creep.memory.role;
      if (role && AI[role] && typeof AI[role].task === 'function') {
        AI[role].task(creep);
      } else {
        AI.harvester.task(creep);
      }
    }
  },
  room: {
    default: {
      routine: (room: Room) => {
        RoomManager.runRoomLogic(room);
      },
      stage0: (room: Room) => {},
      stage1: (room: Room) => {},
      spawnCreep: (spawn: StructureSpawn, blueprint: any, roomMemory: any) => {
        if (!spawn) return false;
        const body = blueprint.body;
        const name = blueprint.name || `${blueprint.memory.role}_${Game.time}`;
        const memory = blueprint.memory;
        try {
          if (global.helpers && global.helpers.spawnCreep) {
            const result = global.helpers.spawnCreep(spawn, body, name, memory);
            return result === OK;
          } else if (spawn.spawnCreep) {
            const result = spawn.spawnCreep(body, name, { memory });
            return result === OK;
          }
        } catch (e) {
          Logger.error(`Error spawning creep: ${(e as Error).message}`);
        }
        return false;
      }
    }
  },
  structure: {
    routine: (structure: Structure) => {
      if (structure.structureType === STRUCTURE_TOWER) {
        AI.tower.routine(structure as StructureTower);
      }
    }
  }
}; 