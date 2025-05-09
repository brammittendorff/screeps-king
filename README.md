# Screeps King - Advanced TypeScript Edition

This is an advanced implementation of Screeps AI with TypeScript support, using best practices and optimized performance.

## Features

- Modular architecture with separated concerns
- TypeScript support with full type definitions
- Efficient memory management
- CPU profiling and optimization
- Task-based system for creep assignments
- Automatic role-based behaviors
- Defense and building systems
- Support for multiple room management
- Automatic creep spawning based on needs

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

### JavaScript Version

Build JavaScript code:
```
npm run build
```

Watch for JavaScript changes:
```
npm run watch
```

Deploy JavaScript code:
```
npm run deploy
```

### TypeScript Version

Build TypeScript code:
```
npm run build:ts
```

Watch for TypeScript changes:
```
npm run watch:ts
```

Deploy TypeScript code:
```
npm run deploy:ts
```

### Other Commands

Deploy to the simulator:
```
npm run deploy:sim        # JavaScript
npm run deploy:sim:ts     # TypeScript
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
npm run deploy:watch      # JavaScript
npm run deploy:watch:ts   # TypeScript
```

## Project Structure

### JavaScript Version
- `src/` - JavaScript source code
  - `ai/` - AI logic for different creep types
  - `config/` - Game configuration
  - `controllers/` - Game controllers
  - `functions/` - Utility functions
  - `patterns/` - Building patterns
  - `templates/` - Creep templates
  - `main.js` - Main game loop

### TypeScript Version
- `src-ts/` - TypeScript source code
  - `ai/` - AI behaviors for different creep roles
  - `config/` - Game settings and constants
  - `managers/` - Manager classes for different game systems
  - `types/` - TypeScript type definitions
  - `utils/` - Utility classes like profiling and logging
  - `main.ts` - Main game loop

## Architecture

The TypeScript codebase follows these design patterns:

1. **Manager System**
   - Each manager handles a specific domain (creeps, rooms, tasks, etc.)
   - Managers provide a centralized interface for operations

2. **Task System**
   - Tasks are created with priorities and assigned to creeps
   - Provides a flexible way to allocate work

3. **Role-Based Behaviors**
   - Different creep roles (harvester, upgrader, etc.) have separate behaviors
   - Each role is implemented as a class with standard interfaces

4. **State Machine**
   - Creeps use state machines to manage behavior
   - States like harvesting, building, upgrading are well-defined

5. **Memory Management**
   - Efficient memory usage with cleanup routines
   - Type-safe memory access

## Linting

Lint your code with:

```
npm run lint      # JavaScript
npm run lint:ts   # TypeScript
```

## License

MIT License
