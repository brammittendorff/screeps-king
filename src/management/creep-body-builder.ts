/**
 * Creep Body Builder
 * Handles creep body part composition for different roles, RCLs, and energy levels
 */

import { CreepRole } from './creep-types';
import * as _ from 'lodash';

/**
 * Context for body building decisions
 */
interface BodyContext {
  storage: number;
  constructionSites: number;
  controllerDowngrade: number;
  urgent: boolean;
}

export class CreepBodyBuilder {
  /**
   * Generate adaptive, context-aware body parts based on available energy and room state
   */
  public static getOptimalBody(role: CreepRole, energy: number, room?: Room): BodyPartConstant[] {
    // --- DYNAMIC BODY SIZING BASED ON RCL AND SWARM/SCALING LOGIC ---
    let urgent = false;
    let storage = 0;
    let constructionSites = 0;
    let controllerDowngrade = 100000;
    let rcl = 1;
    
    if (room) {
      storage = room.storage?.store[RESOURCE_ENERGY] || 0;
      constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES).length;
      controllerDowngrade = room.controller?.ticksToDowngrade || 100000;
      rcl = room.controller?.level || 1;
      urgent = (room.find(FIND_MY_CREEPS).filter(c => c.memory.role === 'harvester').length === 0)
        || (controllerDowngrade < 2000)
        || (room.energyAvailable < 300);
    }
    
    // --- EMERGENCY: Always spawn a minimal harvester if all creeps are dead or controller at risk ---
    if (urgent) {
      switch (role) {
        case CreepRole.Harvester:
        case CreepRole.Upgrader:
          return [WORK, CARRY, MOVE]; // Minimal viable creep
        case CreepRole.Builder:
          return [WORK, CARRY, MOVE];
        case CreepRole.Hauler:
          return [CARRY, CARRY, MOVE];
        case CreepRole.RemoteHarvester:
          return [WORK, CARRY, MOVE];
        default:
          break;
      }
    }

    // Create advanced body patterns based on RCL
    return this.getRclBasedBody(role, energy, rcl, {
      storage,
      constructionSites,
      controllerDowngrade,
      urgent
    });
  }
  
  /**
   * Generate optimized body parts based on room RCL level and available energy
   */
  private static getRclBasedBody(
    role: CreepRole, 
    energy: number, 
    rcl: number, 
    context: BodyContext
  ): BodyPartConstant[] {
    // Based on the role and RCL, return an optimized body
    switch (role) {
      case CreepRole.Harvester:
        return this.getHarvesterBody(energy, rcl, context);
      
      case CreepRole.Upgrader:
        return this.getUpgraderBody(energy, rcl, context);
      
      case CreepRole.Builder:
        return this.getBuilderBody(energy, rcl, context);
      
      case CreepRole.Hauler:
        return this.getHaulerBody(energy, rcl, context);
      
      case CreepRole.RemoteHarvester:
        return this.getRemoteHarvesterBody(energy, rcl);
        
      case CreepRole.Repairer:
        return this.getRepairerBody(energy, rcl);
      
      case CreepRole.Defender:
        return this.getDefenderBody(energy, rcl);
        
      // For other roles, use the legacy system
      default:
        return this.getOptimalBodyOld(role, energy);
    }
  }
  
  /**
   * Generate specialized harvester bodies for different RCL levels
   */
  private static getHarvesterBody(
    energy: number, 
    rcl: number, 
    context: BodyContext
  ): BodyPartConstant[] {
    // Early game (RCL 1-2): Small, efficient harvesters
    if (rcl <= 2) {
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // Mid game (RCL 3-4): Start transitioning to static mining
    if (rcl <= 4) {
      // If we have storage, focus on WORK parts
      if (context.storage > 0) {
        if (energy >= 550) return [WORK, WORK, WORK, WORK, CARRY, MOVE, MOVE];
        if (energy >= 400) return [WORK, WORK, WORK, CARRY, MOVE];
        return [WORK, WORK, CARRY, MOVE];
      }
      
      // No storage yet, balance WORK and CARRY
      if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, WORK, CARRY, MOVE];
    }
    
    // Late game (RCL 5+): Optimal static mining
    // At RCL 5+, harvesters should be specialized for sitting at sources
    let body: BodyPartConstant[] = [];
    
    // Calculate how many WORK parts we can fit (5 is optimal for one source)
    const workParts = Math.min(5, Math.floor((energy - 50) / 100)); // Always ensure at least 1 MOVE
    
    // Add WORK parts first (most important)
    for (let i = 0; i < workParts; i++) {
      body.push(WORK);
    }
    
    // Add one CARRY part for local container filling
    body.push(CARRY);
    
    // Add MOVE parts (1 is enough for static harvesting)
    body.push(MOVE);
    
    // If we can afford more, add extra CARRY parts for container filling
    const remainingEnergy = energy - (workParts * 100 + 50 + 50);
    const extraCarryParts = Math.min(2, Math.floor(remainingEnergy / 50));
    
    for (let i = 0; i < extraCarryParts; i++) {
      body.push(CARRY);
    }
    
    return body.length > 0 ? body : [WORK, CARRY, MOVE];
  }
  
  /**
   * Generate specialized upgrader bodies for different RCL levels
   */
  private static getUpgraderBody(
    energy: number, 
    rcl: number, 
    context: BodyContext
  ): BodyPartConstant[] {
    // Early game (RCL 1-2): Small, efficient upgraders
    if (rcl <= 2) {
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // Emergency downgrade prevention
    if (context.controllerDowngrade < 3000) {
      // Just enough to keep the controller alive
      if (energy >= 300) return [WORK, WORK, CARRY, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // Mid game (RCL 3-4): More balanced upgraders
    if (rcl <= 4) {
      if (energy >= 800) return [WORK, WORK, WORK, WORK, WORK, CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      if (energy >= 550) return [WORK, WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, WORK, CARRY, MOVE];
    }
    
    // RCL 5-7: Optimize for high throughput upgrading
    if (rcl <= 7) {
      let body: BodyPartConstant[] = [];
      
      // Calculate maximum number of WORK parts based on available energy
      // For upgraders, we want more WORK parts with just enough CARRY/MOVE to keep them fed
      const maxWorkParts = Math.min(15, Math.floor((energy - 100) / 100)); // Reserve energy for CARRY and MOVE
      
      // Add WORK parts
      for (let i = 0; i < maxWorkParts; i++) {
        body.push(WORK);
      }
      
      // Calculate remaining energy
      const remainingEnergy = energy - (maxWorkParts * 100);
      
      // Add balanced CARRY and MOVE parts
      const remainingParts = Math.floor(remainingEnergy / 100);
      for (let i = 0; i < remainingParts; i++) {
        body.push(CARRY);
        body.push(MOVE);
      }
      
      // Ensure at least one CARRY and MOVE
      if (!body.includes(CARRY)) body.push(CARRY);
      if (!body.includes(MOVE)) body.push(MOVE);
      
      return body;
    }
    
    // RCL 8: Specialized upgraders (15 energy per tick cap)
    if (rcl === 8) {
      // At RCL 8, we just need 15 WORK parts for the 15 energy per tick upgrade limit
      // Then we add some CARRY/MOVE for practical purposes
      const workParts = Math.min(15, Math.floor((energy - 150) / 100)); // Reserve for 1 CARRY, 2 MOVE
      
      let body: BodyPartConstant[] = [];
      
      // Add WORK parts
      for (let i = 0; i < workParts; i++) {
        body.push(WORK);
      }
      
      // Add minimal CARRY/MOVE
      body.push(CARRY);
      body.push(MOVE);
      body.push(MOVE);
      
      return body;
    }
    
    // Default fallback
    return [WORK, WORK, CARRY, MOVE];
  }
  
  /**
   * Generate specialized builder bodies for different RCL levels
   */
  private static getBuilderBody(
    energy: number, 
    rcl: number, 
    context: BodyContext
  ): BodyPartConstant[] {
    // Early game (RCL 1-2): Simple builders
    if (rcl <= 2) {
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // For builders, we want a balance of WORK and CARRY
    // But we scale based on number of construction sites
    const constructionFactor = Math.min(3, Math.max(1, Math.ceil(context.constructionSites / 5)));
    
    // Mid to late game: Scale with energy and construction needs
    let body: BodyPartConstant[] = [];
    let partCost = 0;
    
    // Maximum parts scales with RCL
    const maxParts = Math.min(50, rcl * 5);
    
    // Add parts in 1:1:1 ratio (WORK:CARRY:MOVE)
    while (energy - partCost >= 200 && body.length < maxParts) {
      // Add parts based on construction factor
      for (let i = 0; i < constructionFactor && energy - partCost >= 200 && body.length < maxParts; i++) {
        body.push(WORK);
        body.push(CARRY);
        body.push(MOVE);
        partCost += 200;
      }
    }
    
    return body.length > 0 ? body : [WORK, CARRY, MOVE];
  }
  
  /**
   * Generate specialized hauler bodies for different RCL levels
   */
  private static getHaulerBody(
    energy: number, 
    rcl: number, 
    context: BodyContext
  ): BodyPartConstant[] {
    // Early game (RCL 1-2): Basic haulers
    if (rcl <= 2) {
      if (energy >= 300) return [CARRY, CARRY, CARRY, MOVE, MOVE, MOVE];
      return [CARRY, CARRY, MOVE, MOVE];
    }
    
    // Haulers need CARRY and MOVE in 1:1 ratio for full capacity movement
    let body: BodyPartConstant[] = [];
    let partCost = 0;
    
    // Maximum parts scales with RCL
    const maxParts = Math.min(50, rcl * 6);
    
    // Add CARRY and MOVE in pairs
    while (energy - partCost >= 100 && body.length < maxParts) {
      body.push(CARRY);
      body.push(MOVE);
      partCost += 100;
    }
    
    return body.length > 0 ? body : [CARRY, CARRY, MOVE, MOVE];
  }
  
  /**
   * Generate specialized remote harvester bodies
   */
  private static getRemoteHarvesterBody(energy: number, rcl: number): BodyPartConstant[] {
    // Remote harvesters need to be more self-sufficient with extra MOVE parts
    
    // Early game (RCL 1-3): Basic remote harvesters
    if (rcl <= 3) {
      if (energy >= 500) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 300) return [WORK, CARRY, CARRY, MOVE, MOVE, MOVE];
      return [WORK, CARRY, MOVE, MOVE];
    }
    
    // Mid to late game: Specialized remote harvesters
    let body: BodyPartConstant[] = [];
    
    // For remote operations, we want WORK, CARRY, and more MOVE parts (2:1:3 ratio)
    const workParts = Math.min(6, Math.floor(energy / 250)); // Need enough for MOVE parts too
    const carryParts = Math.min(workParts, 3); // At least some CARRY
    const moveParts = workParts + carryParts; // Need to move efficiently in remote rooms
    
    // Build body with proper part ordering (WORK first, then CARRY, then MOVE)
    for (let i = 0; i < workParts; i++) body.push(WORK);
    for (let i = 0; i < carryParts; i++) body.push(CARRY);
    for (let i = 0; i < moveParts; i++) body.push(MOVE);
    
    return body.length >= 3 ? body : [WORK, CARRY, MOVE, MOVE];
  }
  
  /**
   * Generate specialized repairer bodies
   */
  private static getRepairerBody(energy: number, rcl: number): BodyPartConstant[] {
    // Repairers are similar to builders but with more emphasis on WORK
    
    // Early game: Basic repairers
    if (rcl <= 2) {
      if (energy >= 400) return [WORK, WORK, CARRY, CARRY, MOVE, MOVE];
      return [WORK, CARRY, MOVE];
    }
    
    // More advanced repairers with higher WORK ratio
    let body: BodyPartConstant[] = [];
    
    // Calculate part distribution (2:1:1.5 ratio of WORK:CARRY:MOVE)
    const total = Math.floor(energy / 200); // Approximate cost per set
    const workParts = Math.min(Math.ceil(total * 0.45), 10); // ~45% WORK
    const carryParts = Math.min(Math.ceil(total * 0.25), 6); // ~25% CARRY
    const moveParts = Math.min(Math.ceil(total * 0.3), 8); // ~30% MOVE
    
    // Add parts in the right order
    for (let i = 0; i < workParts; i++) body.push(WORK);
    for (let i = 0; i < carryParts; i++) body.push(CARRY);
    for (let i = 0; i < moveParts; i++) body.push(MOVE);
    
    return body.length >= 3 ? body : [WORK, CARRY, MOVE];
  }
  
  /**
   * Generate specialized defender bodies based on RCL
   */
  private static getDefenderBody(energy: number, rcl: number): BodyPartConstant[] {
    // Early game: Basic defenders
    if (rcl <= 3) {
      if (energy >= 390) return [TOUGH, ATTACK, ATTACK, MOVE, MOVE];
      return [ATTACK, MOVE];
    }
    
    // Mid game: Better defenders
    if (rcl <= 5) {
      if (energy >= 740) return [TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE];
      if (energy >= 490) return [TOUGH, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE];
      return [ATTACK, ATTACK, MOVE, MOVE];
    }
    
    // Late game: Advanced defenders with healing
    let body: BodyPartConstant[] = [];
    
    // Balanced defense composition with tough, attack, heal, and move
    const toughCount = Math.min(6, Math.floor(energy * 0.1 / 10)); // ~10% TOUGH
    const attackCount = Math.min(15, Math.floor(energy * 0.5 / 80)); // ~50% ATTACK
    const healCount = Math.min(5, Math.floor(energy * 0.2 / 250)); // ~20% HEAL
    const moveCount = toughCount + attackCount + healCount; // Equal MOVE parts
    
    // Add parts in the right order (TOUGH first, then ATTACK, then HEAL, then MOVE)
    for (let i = 0; i < toughCount; i++) body.push(TOUGH);
    for (let i = 0; i < attackCount; i++) body.push(ATTACK);
    for (let i = 0; i < healCount; i++) body.push(HEAL);
    for (let i = 0; i < moveCount; i++) body.push(MOVE);
    
    return body.length >= 3 ? body : [ATTACK, ATTACK, MOVE, MOVE];
  }

  /**
   * Legacy fallback for non-worker roles
   */
  private static getOptimalBodyOld(role: CreepRole, energy: number): BodyPartConstant[] {
    // Basic creep bodies
    let body: BodyPartConstant[] = [];
    
    switch (role) {
      case CreepRole.Scout:
        // Scouts just need MOVE parts
        body = [MOVE];
        
        // Add more MOVE parts if energy allows
        let remainingEnergy = energy - 50;
        while (remainingEnergy >= 50 && body.length < 50) {
          body.push(MOVE);
          remainingEnergy -= 50;
        }
        break;
        
      case CreepRole.Reserver:
        // Reservers need CLAIM parts
        if (energy >= 650) {
          body = [CLAIM, CLAIM, MOVE, MOVE];
        } else {
          body = [CLAIM, MOVE];
        }
        break;
        
      case CreepRole.Claimer:
        // Claimers need CLAIM parts
        if (energy >= 850) {
          body = [CLAIM, MOVE, MOVE, MOVE];
        } else if (energy >= 650) {
          body = [CLAIM, MOVE, MOVE];
        } else {
          body = [CLAIM, MOVE];
        }
        break;
        
      default:
        // Default body
        body = [WORK, CARRY, MOVE];
        break;
    }
    
    return body;
  }
}