# Screeps King - Advanced TypeScript Edition

This is an advanced implementation of Screeps AI with TypeScript support, using best practices and optimized performance. The system features a sophisticated multi-room colony management system with expansion capabilities, advanced logging, and resource sharing between rooms.

## Features

- Fully TypeScript implementation with type definitions
- Modular architecture with separated concerns
- Multi-room colony management (up to 4 rooms)
- Automatic room expansion and remote harvesting
- State machine-based creep behaviors
- Efficient memory management and caching
- Advanced logging with color-coded console output
- CPU profiling and optimization
- Priority-based spawning system
- Automatic room planning and construction
- Room defense and hostile detection
- Statistics visualization and monitoring
- Remote mining and resource sharing between rooms

## Installation

Install all npm packages:

```
npm install
```

## Configuration

1. Copy the `.env.example` file to `.env`:

```
cp .env.example .env
```

2. Edit the `.env` file and set your authentication:

```
# For token authentication (recommended)
SCREEPS_TOKEN=your_auth_token

# For username/password authentication (private servers)
SCREEPS_USERNAME=your_username
SCREEPS_PASSWORD=your_password
```

You can get your auth token from the [Screeps account page](https://screeps.com/a/#!/account).

### Additional Configuration Options

You can customize other deployment settings in your `.env` file:

```
SCREEPS_BRANCH=main          # The branch to deploy to
SCREEPS_HOST=screeps.com     # The server hostname
SCREEPS_PORT=443             # The server port
SCREEPS_PROTOCOL=https       # The server protocol
SCREEPS_SHARD=shard3         # The shard to deploy to
```

### GitLab CI/CD

This project includes GitLab CI/CD configuration. To use it, set up the following environment variables in your GitLab project settings:

- `SCREEPS_TOKEN` - Your Screeps authentication token

## Build and Deploy

### Build and Deploy Commands

Build the code:
```
npm run build
```

Watch for code changes:
```
npm run watch
```

Deploy to Screeps server:
```
npm run deploy
```

Deploy to the simulator:
```
npm run deploy:sim
```

View logs:
```
npm run logs              # All logs
npm run logs:error        # Error logs
npm run logs:modules      # Module logs
npm run logs:controllers  # Controller logs
```

Deploy and watch logs:
```
npm run deploy:watch
```

## Project Structure
- `src/` - TypeScript source code
  - `ai/` - AI behaviors for different creep roles
    - `harvester.ts` - Harvester creep logic
    - `upgrader.ts` - Upgrader creep logic
    - `builder.ts` - Builder creep logic
    - `claimer.ts` - Room claiming logic
    - `tower.ts` - Tower defense logic
  - `config/` - Game settings and constants
  - `managers/` - Manager classes for different game systems
    - `colony-manager.ts` - Multi-room colony coordination
    - `creep-manager.ts` - Creep spawning and assignment
    - `memory-manager.ts` - Memory management and cleanup
    - `room-manager.ts` - Room-level operations
    - `structure-manager.ts` - Structure management
    - `task-manager.ts` - Task assignment system
  - `types/` - TypeScript type definitions
    - `memory.d.ts` - Memory structure definitions
    - `global.d.ts` - Global object declarations
  - `utils/` - Utility classes
    - `logger.ts` - Advanced colored logging system
    - `profiler.ts` - CPU usage profiling
    - `stats-display.ts` - Game statistics visualization
    - `scout-helper.ts` - Room scouting utilities
    - `helpers.ts` - General helper functions
  - `main.ts` - Main game loop

## Architecture

The TypeScript codebase follows these design patterns:

1. **Manager System**
   - Each manager handles a specific domain (creeps, rooms, colony, etc.)
   - Managers provide a centralized interface for operations
   - Static classes with clear responsibilities and interfaces

2. **State Machine Pattern**
   - Creeps use state machines to manage behavior
   - States like harvesting, building, upgrading are well-defined
   - Clean transitions between states with appropriate context

3. **Role-Based Behaviors**
   - Different creep roles (harvester, upgrader, builder, etc.) have specialized behaviors
   - Each role is implemented as a class with standard interfaces
   - Roles can be assigned to different rooms including remote operations

4. **Priority-Based Spawning**
   - Creeps are spawned based on priority and room needs
   - Dynamic body composition based on available energy
   - Queue system for managing spawn requests

5. **Memory Management**
   - Efficient memory usage with cleanup routines
   - Type-safe memory access with TypeScript interfaces
   - Defensive programming to prevent undefined errors

## Multi-Room Colony Management

The system is designed to manage a colony of up to 4 rooms with coordination between them. The colony management features include:

### Room Types and Management

- **Owned Rooms**: Full control with spawns and structures
- **Reserved Rooms**: Controller reserved for remote harvesting
- **Scouted Rooms**: Explored rooms for potential expansion
- **Neutral Rooms**: Unexplored rooms that may contain valuable resources

### Automatic Room Expansion

The colony will automatically expand to new rooms when:

1. Your Global Control Level (GCL) is higher than your current room count
2. You have sufficient energy resources (20k+ in storage)
3. A suitable target room has been identified

The expansion process includes:

1. **Scouting**: Scout creeps explore neighboring rooms
2. **Evaluation**: Rooms are scored based on sources, minerals, and terrain
3. **Claiming**: Claimer creeps are sent to claim promising rooms
4. **Building**: Initial structures (spawn, extensions) are placed
5. **Development**: The room is developed using the same patterns as established rooms

### Remote Harvesting

For rooms that aren't claimed but have valuable resources:

1. **Reservation**: Reserver creeps maintain controller reservation
2. **Remote Harvesters**: Dedicated creeps harvest resources
3. **Haulers**: Transport resources back to owned rooms
4. **Infrastructure**: Containers are built near sources for efficiency

### Resource Sharing

Resources are balanced between rooms in your colony:

1. **Energy Distribution**: Surplus energy from established rooms helps newer rooms
2. **Terminal Network**: Rooms with terminals automatically share resources
3. **Resource Balancing**: The Colony Manager ensures resources are distributed optimally

### Room Defense

The system includes defensive capabilities:

1. **Hostile Detection**: Automatically detects enemy creeps
2. **Tower Management**: Coordinates tower actions for defense
3. **Safe Mode**: Activates safe mode when critical structures are threatened

## Console Commands

The game provides several console commands to control and monitor your colony:

### Statistics and Information

- `stats()` - Display colony statistics once
- `stats(true)` - Enable automatic statistics display (every 10 ticks)
- `stats(false)` - Disable automatic statistics display

### Logging

- `setLogLevel('DEBUG')` - Set log level to DEBUG (most verbose)
- `setLogLevel('INFO')` - Set log level to INFO (standard information)
- `setLogLevel('WARNING')` - Set log level to WARNING (only warnings and errors)
- `setLogLevel('ERROR')` - Set log level to ERROR (only errors)

### Memory Management

- `Memory.colony.expansionTargets.push('W2N3')` - Add a room to expansion targets
- `delete Memory.creeps[creepName]` - Delete a creep's memory

### Manual Room Expansion

If you want to manually control room expansion:

1. Add a room to expansion targets:
```javascript
// Replace W2N3 with your target room name
if (!Memory.colony.expansionTargets) Memory.colony.expansionTargets = [];
Memory.colony.expansionTargets.push('W2N3');
```

2. Spawn a claimer manually:
```javascript
// Replace roomName with your source room
// Replace targetRoomName with the room to claim
Game.rooms['roomName'].memory.spawnQueue = Game.rooms['roomName'].memory.spawnQueue || [];
Game.rooms['roomName'].memory.spawnQueue.push({
  role: 'claimer',
  body: [CLAIM, MOVE, MOVE, MOVE],
  memory: {
    role: 'claimer',
    homeRoom: 'roomName',
    targetRoom: 'targetRoomName'
  },
  priority: 90
});
```

3. Send builders to help bootstrap the new room:
```javascript
// Replace roomName with your source room
// Replace newRoomName with the newly claimed room
Game.rooms['roomName'].memory.spawnQueue = Game.rooms['roomName'].memory.spawnQueue || [];
Game.rooms['roomName'].memory.spawnQueue.push({
  role: 'builder',
  body: [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE],
  memory: {
    role: 'builder',
    homeRoom: 'roomName',
    targetRoom: 'newRoomName'
  },
  priority: 60
});
```

## Linting

Lint your code with:

```
npm run lint      # JavaScript
npm run lint:ts   # TypeScript
```

## Troubleshooting

### Common Issues

1. **Cannot read property of undefined**
   - This is usually due to missing memory initialization
   - Look for defensive coding patterns in our code (global.go.resource checks)
   - Fix with proper memory initialization in MemoryManager

2. **Creeps not spawning**
   - Check if energy is sufficient for the requested creep body
   - Verify spawn queue is properly initialized
   - Look at creep priorities - higher priority creeps might be blocking others

3. **Remote creeps not working correctly**
   - Ensure proper room names in homeRoom and targetRoom memory
   - Check pathfinding for obstacles or walls
   - Verify that the creep has the necessary body parts for its role

### Debugging Tips

1. Enable debug logging to see detailed messages:
```javascript
setLogLevel('DEBUG');
```

2. View colony statistics to monitor resource levels:
```javascript
stats();
```

3. Check memory structure for errors:
```javascript
// View specific memory sections
console.log(JSON.stringify(Memory.colony, null, 2));
```

## License

MIT License
