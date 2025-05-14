# Screeps King Bot

A professional, robust, and highly modular Screeps AI designed to scale optimally from RCL 1 to 8, with advanced recovery, mapping, and management features.

## Features
- **Modular architecture**: Clear separation of roles, management, planning, and utilities.
- **Room mapping & planning**: Automated mapping of sources, controller, and optimal structure/road placement.
- **Dynamic creep management**: All core and remote roles scale based on real-time mapping and room needs.
- **Advanced recovery**: Emergency logic for controller downgrade, energy starvation, construction stalling, and more.
- **Even distribution**: Harvesters, haulers, and remote creeps are evenly and optimally assigned.
- **Configurable thresholds**: All critical thresholds are easily tunable in configuration files.
- **Automated defense**: Defenders and tower supply ramp up automatically if hostiles are detected.
- **Detailed logging**: All critical events are logged and notified via `Game.notify`.
- **Type safety**: All new memory fields are type-safe and included in TypeScript definitions.

## Directory Structure
```
src/
  roles/           # All creep role logic
  management/      # Creep, room, and resource management
  planners/        # Room mapping and structure/road planning
  utils/           # Shared utilities
  control/         # Main game loop and control logic
  configuration/   # Configurable thresholds and tuning
  @types/          # TypeScript type definitions
```

## Quickstart
1. **Clone the repo** and install dependencies (if using TypeScript, run `npm install`).
2. **Configure thresholds** in `src/configuration/` as needed for your playstyle.
3. **Upload to Screeps** (official or private server).
4. **Monitor logs and notifications** for critical events and tuning suggestions.

## Advanced Features
- **RoomPlanner**: Maps all sources, controller, and plans optimal structure/road placement. Stores walkable spots for optimal creep assignment.
- **CreepManager**: Dynamically scales all roles, evenly distributes harvesters/haulers, and adapts to emergencies.
- **Resilience**: Handles controller downgrade, energy starvation, construction stalling, and spawn blockage with adaptive logic.
- **Remote Mining**: Robust assignment and recovery for remote harvesters/haulers.
- **Idle Management**: Recycles or parks idle creeps to optimize CPU and energy.
- **Market Automation**: Auto-sells excess energy if storage is full.

## Configuration & Tuning
- All thresholds (e.g., construction stalling, controller downgrade, energy starvation) are configurable in `src/configuration/`.
- Emergency and scaling logic can be tuned for aggressive or conservative playstyles.

## Extending the Bot
- Add new roles in `src/roles/` and register them in the AI system.
- Extend mapping/planning logic in `src/planners/` for new structure types or layouts.
- Add new management features in `src/management/` as needed.

## Best Practices
- Keep roles and management logic modular and well-documented.
- Use type-safe memory fields and update type definitions in `@types/`.
- Monitor logs and notifications for tuning opportunities.
- Regularly review and tune configuration for optimal performance.

## License
MIT
