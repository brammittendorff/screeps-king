import { RoomData } from './types';

let roomCache: Record<string, RoomData> = {};

export function initRoomManager() {
  if (!Memory.roomData) {
    Memory.roomData = {};
  }
  for (const roomName in Memory.roomData) {
    roomCache[roomName] = Memory.roomData[roomName];
  }
}

export function updateRoomCache() {
  // Implementation from RoomManager.updateRoomCache
}

export function saveRoomCache() {
  // Implementation from RoomManager.saveRoomCache
}

export function getRoomCache(): Record<string, RoomData> {
  return roomCache;
}

export function getRoomData(roomName: string): RoomData {
  return roomCache[roomName];
} 