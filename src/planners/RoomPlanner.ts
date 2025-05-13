// Efficient room mapping and road planning for Screeps
export namespace RoomMapper {
  export function mapRoom(room: Room) {
    const mapping = (room.memory.mapping ??= {} as any);
    if (!mapping.mapped || mapping.lastMappedRCL !== room.controller?.level) {
      // Find sources, controller, spawns
      const sources = room.find(FIND_SOURCES);
      const controller = room.controller;
      const spawns = room.find(FIND_MY_SPAWNS);
      const storage = room.storage;

      // Store only positions and IDs
      mapping.sources = sources.map(s => {
        let spots = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = s.pos.x + dx, y = s.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const terrain = room.getTerrain().get(x, y);
            if (terrain !== TERRAIN_MASK_WALL) spots++;
          }
        }
        return { x: s.pos.x, y: s.pos.y, id: s.id, spots };
      });
      if (controller) {
        let spots = 0;
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            const x = controller.pos.x + dx, y = controller.pos.y + dy;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const terrain = room.getTerrain().get(x, y);
            if (terrain !== TERRAIN_MASK_WALL) spots++;
          }
        }
        mapping.controller = { x: controller.pos.x, y: controller.pos.y, id: controller.id, spots };
      } else {
        mapping.controller = undefined;
      }
      mapping.spawns = spawns.map(s => ({ x: s.pos.x, y: s.pos.y, id: s.id }));
      mapping.storage = storage ? { x: storage.pos.x, y: storage.pos.y, id: storage.id } : undefined;

      // Plan road endpoints (not full paths)
      mapping.roadPlans = [];
      const roadTargets = storage ? [storage] : spawns;
      for (const source of sources) {
        for (const target of roadTargets) {
          mapping.roadPlans.push({ from: { x: source.pos.x, y: source.pos.y }, to: { x: target.pos.x, y: target.pos.y } });
        }
      }
      if (controller && roadTargets.length) {
        for (const target of roadTargets) {
          mapping.roadPlans.push({ from: { x: controller.pos.x, y: controller.pos.y }, to: { x: target.pos.x, y: target.pos.y } });
        }
      }
      mapping.mapped = true;
      mapping.lastMappedRCL = room.controller?.level;
    }
  }

  export function buildRoads(room: Room) {
    const mapping = room.memory.mapping as any;
    if (!mapping || !mapping.roadPlans) return;
    for (const plan of mapping.roadPlans) {
      const path = PathFinder.search(
        new RoomPosition(plan.from.x, plan.from.y, room.name),
        { pos: new RoomPosition(plan.to.x, plan.to.y, room.name), range: 1 },
        {
          plainCost: 2,
          swampCost: 10,
          roomCallback: r => {
            if (r !== room.name) return false;
            const costs = new PathFinder.CostMatrix();
            // Optionally, add extra cost for existing structures
            return costs;
          }
        }
      ).path;
      for (const pos of path) {
        const structures = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y);
        const sites = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y);
        if (!structures.some(s => s.structureType === STRUCTURE_ROAD) &&
            !sites.some(s => s.structureType === STRUCTURE_ROAD)) {
          room.createConstructionSite(pos.x, pos.y, STRUCTURE_ROAD);
          break; // Only place one per tick per plan
        }
      }
    }
  }

  export function planStructures(room: Room) {
    const mapping = (room.memory.mapping ??= {} as any);
    if (!mapping.spawns || mapping.spawns.length === 0) return;
    const spawn = mapping.spawns[0];
    const controller = mapping.controller;
    const sources = mapping.sources || [];
    mapping.plannedStructures = mapping.plannedStructures || {};
    // --- Plan Extensions (spiral/grid around spawn) ---
    const maxExtensions = CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][room.controller?.level || 0] || 0;
    const plannedExt: {x: number, y: number}[] = [];
    let count = 0;
    for (let r = 2; r < 8 && count < maxExtensions; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // Only edge
          const x = spawn.pos.x + dx, y = spawn.pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const terrain = room.getTerrain().get(x, y);
          if (terrain === TERRAIN_MASK_WALL) continue;
          if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
          if (controller && x === controller.pos.x && y === controller.pos.y) continue;
          if (sources.some(s => s.x === x && s.y === y)) continue;
          plannedExt.push({x, y});
          count++;
          if (count >= maxExtensions) break;
        }
        if (count >= maxExtensions) break;
      }
      if (count >= maxExtensions) break;
    }
    mapping.plannedStructures[STRUCTURE_EXTENSION] = plannedExt;
    // --- Plan Towers ---
    const maxTowers = CONTROLLER_STRUCTURES[STRUCTURE_TOWER][room.controller?.level || 0] || 0;
    const plannedTowers: {x: number, y: number}[] = [];
    if (maxTowers > 0) {
      // 1st: near spawn, 2nd: near controller, 3rd: near center
      if (spawn) plannedTowers.push({x: spawn.pos.x + 2, y: spawn.pos.y});
      if (controller) plannedTowers.push({x: controller.pos.x - 2, y: controller.pos.y});
      if (maxTowers > 2) plannedTowers.push({x: 25, y: 25});
    }
    mapping.plannedStructures[STRUCTURE_TOWER] = plannedTowers.slice(0, maxTowers);
    // --- Plan Containers ---
    const plannedContainers: {x: number, y: number}[] = [];
    for (const source of sources) {
      // Place container adjacent to source (prefer non-wall, non-swamp)
      let placed = false;
      for (let dx = -1; dx <= 1 && !placed; dx++) {
        for (let dy = -1; dy <= 1 && !placed; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = source.pos.x + dx, y = source.pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const terrain = room.getTerrain().get(x, y);
          if (terrain === TERRAIN_MASK_WALL) continue;
          if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
          plannedContainers.push({x, y});
          placed = true;
        }
      }
    }
    // Controller container
    if (controller) {
      let placed = false;
      for (let dx = -1; dx <= 1 && !placed; dx++) {
        for (let dy = -1; dy <= 1 && !placed; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = controller.pos.x + dx, y = controller.pos.y + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const terrain = room.getTerrain().get(x, y);
          if (terrain === TERRAIN_MASK_WALL) continue;
          if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
          plannedContainers.push({x, y});
          placed = true;
        }
      }
    }
    mapping.plannedStructures[STRUCTURE_CONTAINER] = plannedContainers;
    // --- Plan Terminal ---
    const maxTerminal = CONTROLLER_STRUCTURES[STRUCTURE_TERMINAL][room.controller?.level || 0] || 0;
    const plannedTerminal: {x: number, y: number}[] = [];
    if (maxTerminal > 0) {
      // Place terminal near storage or spawn
      let tx, ty;
      if (mapping.storage) {
        tx = mapping.storage.x + 1;
        ty = mapping.storage.y;
      } else {
        tx = spawn.pos.x + 1;
        ty = spawn.pos.y;
      }
      plannedTerminal.push({x: tx, y: ty});
    }
    mapping.plannedStructures[STRUCTURE_TERMINAL] = plannedTerminal.slice(0, maxTerminal);
    // --- Plan Labs ---
    const maxLabs = CONTROLLER_STRUCTURES[STRUCTURE_LAB][room.controller?.level || 0] || 0;
    const plannedLabs: {x: number, y: number}[] = [];
    if (maxLabs > 0) {
      // Cluster labs near storage or spawn
      let baseX, baseY;
      if (mapping.storage) {
        baseX = mapping.storage.x + 2;
        baseY = mapping.storage.y;
      } else {
        baseX = spawn.pos.x + 2;
        baseY = spawn.pos.y;
      }
      let countLab = 0;
      for (let dx = 0; dx < 3 && countLab < maxLabs; dx++) {
        for (let dy = 0; dy < 3 && countLab < maxLabs; dy++) {
          const x = baseX + dx, y = baseY + dy;
          if (x < 1 || x > 48 || y < 1 || y > 48) continue;
          const terrain = room.getTerrain().get(x, y);
          if (terrain === TERRAIN_MASK_WALL) continue;
          if (room.lookForAt(LOOK_STRUCTURES, x, y).length > 0) continue;
          plannedLabs.push({x, y});
          countLab++;
        }
      }
    }
    mapping.plannedStructures[STRUCTURE_LAB] = plannedLabs;
    // --- Plan Links ---
    const maxLinks = CONTROLLER_STRUCTURES[STRUCTURE_LINK][room.controller?.level || 0] || 0;
    const plannedLinks: {x: number, y: number}[] = [];
    if (maxLinks > 0) {
      // At sources
      for (const source of sources) {
        plannedLinks.push({x: source.pos.x, y: source.pos.y});
      }
      // Near controller
      if (controller) plannedLinks.push({x: controller.pos.x, y: controller.pos.y + 1});
      // Near storage or spawn
      if (mapping.storage) plannedLinks.push({x: mapping.storage.x - 1, y: mapping.storage.y});
      else plannedLinks.push({x: spawn.pos.x - 1, y: spawn.pos.y});
    }
    mapping.plannedStructures[STRUCTURE_LINK] = plannedLinks.slice(0, maxLinks);
  }

  export function placePlannedConstructionSites(room: Room) {
    const mapping = room.memory.mapping;
    if (!mapping || !mapping.plannedStructures) return;
    // For each structure type, place up to allowed number
    for (const type of [STRUCTURE_EXTENSION, STRUCTURE_TOWER, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL, STRUCTURE_LAB, STRUCTURE_LINK]) {
      const max = CONTROLLER_STRUCTURES[type][room.controller?.level || 0] || 0;
      const existing = room.find(FIND_STRUCTURES, { filter: s => s.structureType === type }).length;
      const sites = room.find(FIND_CONSTRUCTION_SITES, { filter: s => s.structureType === type }).length;
      if (existing + sites >= max) continue;
      const planned = mapping.plannedStructures[type] || [];
      for (const pos of planned) {
        // If nothing is built or planned here, place site
        const hasStructure = room.lookForAt(LOOK_STRUCTURES, pos.x, pos.y).some(s => s.structureType === type);
        const hasSite = room.lookForAt(LOOK_CONSTRUCTION_SITES, pos.x, pos.y).some(s => s.structureType === type);
        if (!hasStructure && !hasSite) {
          room.createConstructionSite(pos.x, pos.y, type);
          break; // Only one per tick per type
        }
      }
    }
  }
} 