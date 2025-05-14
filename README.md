# Screeps King Bot

A professional, highly modular Screeps AI designed to scale optimally from RCL 1 to 8, with advanced room planning, creep management, and defense features.

## Features

- **Modular architecture**: Clear separation of roles, management, planning, and utilities.
- **Role-based creep design**: All creeps use a state machine architecture with specialized strategy patterns.
- **Dynamic room planning**: Automated mapping of sources, controllers, and optimal building placement.
- **Optimized movement**: Terrain-based movement optimizer with room-specific pathing strategies.
- **Resource management**: Prioritized energy distribution system with efficient source assignment.
- **Defensive systems**: Automatic tower management and defender spawning when threats are detected.
- **Multi-room coordination**: Colony manager and remote mining capabilities for expansion.
- **Advanced recovery**: Emergency triggers and fail-safes to recover from difficult situations.
- **Performance optimization**: CPU and memory usage monitoring with configurable thresholds.
- **Detailed logging**: Comprehensive logging system with multiple verbosity levels.

## Directory Structure

```
src/
  @types/          # TypeScript type definitions
  buildings/       # Building logic (towers, etc.)
  configuration/   # Game constants and configurable parameters
  control/         # High-level game control
  core/            # Core game loop and initialization
  management/      # Resource and entity management
    colony-manager.ts        # Multi-room colony coordination
    creep-manager/           # Creep lifecycle management
    room-manager/            # Room state management
  planners/        # Room planning and structure placement
  roles/           # Creep role implementations
    strategies/    # Role-specific strategy patterns
  utils/           # Utility functions and helpers
```

## Creep Roles

The bot includes the following creep roles, each with specialized behaviors:

- **Harvester**: Collects energy from sources and delivers to structures
- **Hauler**: Transfers resources between containers, storage, and structures
- **Upgrader**: Focuses on upgrading the room controller
- **Builder**: Constructs buildings from construction sites
- **Repairer**: Maintains structures and repairs damage
- **Defender**: Protects rooms from hostile creeps
- **Scout**: Explores and gathers intelligence from unexplored rooms
- **Claimer**: Claims new rooms for expansion
- **Destroyer**: Dismantles hostile structures and stored energy
- **Archer**: Ranged combat unit for offensive operations

## Getting Started

### Prerequisites

- Node.js and npm
- Screeps account (official server or private)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/brammittendorff/my-screeps.git
   cd my-screeps
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file with your Screeps credentials:
   ```
   SCREEPS_TOKEN=your-token-here
   SCREEPS_USERNAME=your-username
   SCREEPS_PASSWORD=your-password
   SCREEPS_HOST=screeps.com
   SCREEPS_PROTOCOL=https
   SCREEPS_PORT=443
   SCREEPS_BRANCH=main
   SCREEPS_SHARD=shard3
   ```

4. Build the project:
   ```
   npm run build
   ```

5. Deploy to Screeps:
   ```
   npm run deploy
   ```

### Development Commands

- `npm run build`: Compile TypeScript to JavaScript
- `npm run watch`: Watch for changes and rebuild automatically
- `npm run deploy`: Build and deploy to Screeps server
- `npm run deploy:sim`: Deploy to simulation branch
- `npm run logs`: View console logs
- `npm run logs:error`: View error logs only

## Configuration

The `src/configuration/constants.ts` file contains essential game parameters:

- **CPU management**: Bucket and usage thresholds
- **Creep lifecycle**: Lifespan and renewal settings
- **Room control**: Energy capacity thresholds, desired creep counts by RCL
- **Task priorities**: Priority values for different task types
- **Defense settings**: Hostile detection and response parameters
- **Expansion settings**: Room evaluation metrics and expansion strategies

## Advanced Features

### Movement Optimizer

The `MovementOptimizer` class provides advanced pathing strategies based on room terrain analysis. It categorizes rooms into types (open, swampy, walled, maze, mixed) and applies optimized movement costs.

### Room Planner

The `RoomPlanner` automatically maps room resources and plans optimal structure placement, including:
- Road networks between key structures
- Extension clusters around spawns
- Container placement near sources and controllers
- Advanced structure positioning (storage, terminal, labs, towers)

### Creep Strategies

The bot uses a strategy pattern for creep roles, separating behavior logic from the core creep functionality. Each role implements:
- `getBodyParts`: Provides optimal body designs based on available energy and RCL
- `getDefaultMemory`: Sets up role-specific memory
- `runStateHarvesting/Working`: Defines state-specific behaviors

### Task Management

The central `TaskManager` coordinates creep activities through a priority-based task system, enabling:
- Dynamic task assignment based on room needs
- Load balancing across multiple creeps
- Emergency task prioritization

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Screeps game documentation and community
- Special thanks to all contributors