interface RoomMemory {
  adjacentRooms?: {
    [roomName: string]: {
      status: string;
    };
  };
  emergency?: boolean;
} 