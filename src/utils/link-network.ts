/**
 * Link Network Manager
 * Handles automated energy distribution using links for RCL 5+ rooms
 */

import { Logger } from './logger';
import { RoomCache } from './room-cache';

export interface LinkInfo {
  id: Id<StructureLink>;
  type: 'source' | 'controller' | 'storage';
  priority: number; // Higher number = higher priority
}

/**
 * Manages the link network for efficient energy transport
 */
export class LinkNetwork {
  // Cache link networks by room
  private static networks: { [roomName: string]: LinkInfo[] } = {};
  private static lastNetworkUpdate: { [roomName: string]: number } = {};
  
  /**
   * Run the link network for all rooms with links
   */
  public static run(): void {
    // Only run every 10 ticks to save CPU
    if (Game.time % 10 !== 0) return;
    
    // Process each owned room
    for (const roomName in Game.rooms) {
      const room = Game.rooms[roomName];
      
      // Skip rooms we don't own or don't have links
      if (!room.controller || !room.controller.my || room.controller.level < 5) continue;
      
      try {
        // Run the link network for this room
        this.processRoom(room);
      } catch (e) {
        Logger.error(`Error in LinkNetwork for room ${roomName}: ${e}`);
      }
    }
  }
  
  /**
   * Process the link network for a specific room
   */
  private static processRoom(room: Room): void {
    // Get or build the link network
    const network = this.getLinkNetwork(room);
    if (!network || network.length < 2) return; // Need at least 2 links to transfer
    
    // Sort by type: storage > controller > source
    const storageLinks = network.filter(link => link.type === 'storage');
    const controllerLinks = network.filter(link => link.type === 'controller');
    const sourceLinks = network.filter(link => link.type === 'source');
    
    // Check for controller downgrade risk
    const isControllerAtRisk = room.controller && room.controller.ticksToDowngrade < 10000;
    
    // Process all source links
    for (const sourceLink of sourceLinks) {
      const link = Game.getObjectById(sourceLink.id);
      if (!link) continue;
      
      // Skip if not enough energy or on cooldown
      if (link.store.getUsedCapacity(RESOURCE_ENERGY) < link.store.getCapacity(RESOURCE_ENERGY) * 0.8 || link.cooldown > 0) continue;
      
      // Determine target link based on priority
      let targetLink: StructureLink | null = null;
      
      // If controller is at risk, prioritize controller link
      if (isControllerAtRisk && controllerLinks.length > 0) {
        // Find controller link with lowest energy
        const sortedControllerLinks = controllerLinks
          .map(info => Game.getObjectById(info.id))
          .filter((link): link is StructureLink => !!link)
          .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY));
        
        if (sortedControllerLinks.length > 0 && 
            sortedControllerLinks[0].store.getFreeCapacity(RESOURCE_ENERGY) >= 100) {
          targetLink = sortedControllerLinks[0];
        }
      }
      
      // If no controller link or controller not at risk, use storage link
      if (!targetLink && storageLinks.length > 0) {
        // Find storage link with lowest energy
        const sortedStorageLinks = storageLinks
          .map(info => Game.getObjectById(info.id))
          .filter((link): link is StructureLink => !!link)
          .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY));
        
        if (sortedStorageLinks.length > 0 && 
            sortedStorageLinks[0].store.getFreeCapacity(RESOURCE_ENERGY) >= 100) {
          targetLink = sortedStorageLinks[0];
        }
      }
      
      // If no target found, try any other link
      if (!targetLink) {
        // Try any other link that's not a source link
        const otherLinks = network
          .filter(info => info.type !== 'source' && info.id !== sourceLink.id)
          .map(info => Game.getObjectById(info.id))
          .filter((link): link is StructureLink => !!link)
          .sort((a, b) => a.store.getUsedCapacity(RESOURCE_ENERGY) - b.store.getUsedCapacity(RESOURCE_ENERGY));
        
        if (otherLinks.length > 0 && 
            otherLinks[0].store.getFreeCapacity(RESOURCE_ENERGY) >= 100) {
          targetLink = otherLinks[0];
        }
      }
      
      // Transfer energy if target was found
      if (targetLink) {
        link.transferEnergy(targetLink);
        Logger.info(`Link in ${room.name}: Transferred energy from ${link.id} to ${targetLink.id}`);
      }
    }
  }
  
  /**
   * Get or discover the link network for a room
   */
  private static getLinkNetwork(room: Room): LinkInfo[] {
    // Check if we need to re-scan the room
    const lastUpdate = this.lastNetworkUpdate[room.name] || 0;
    const forceUpdate = !this.networks[room.name] || Game.time - lastUpdate > 1000;
    
    // If the network is cached and we don't need to update, return it
    if (!forceUpdate && this.networks[room.name]) {
      return this.networks[room.name];
    }
    
    // Scan room for links and classify them
    const links = RoomCache.get(room, FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_LINK }
    }) as StructureLink[];
    
    if (links.length === 0) return [];
    
    const network: LinkInfo[] = [];
    
    for (const link of links) {
      // Check if near a source - source links
      const nearbySources = link.pos.findInRange(FIND_SOURCES, 2);
      if (nearbySources.length > 0) {
        network.push({
          id: link.id,
          type: 'source',
          priority: 0 // Lowest priority for receiving
        });
        continue;
      }
      
      // Check if near controller - controller links
      if (room.controller && link.pos.getRangeTo(room.controller) <= 3) {
        network.push({
          id: link.id,
          type: 'controller',
          priority: 2 // High priority for receiving
        });
        continue;
      }
      
      // Check if near storage - storage links
      if (room.storage && link.pos.getRangeTo(room.storage) <= 3) {
        network.push({
          id: link.id,
          type: 'storage',
          priority: 1 // Medium priority for receiving
        });
        continue;
      }
      
      // Otherwise, treat as storage link (central)
      network.push({
        id: link.id,
        type: 'storage',
        priority: 1
      });
    }
    
    // Cache the network
    this.networks[room.name] = network;
    this.lastNetworkUpdate[room.name] = Game.time;
    
    Logger.info(`Discovered link network in ${room.name}: ${network.length} links`);
    return network;
  }
  
  /**
   * Force a rescan of the link network
   */
  public static forceRescan(room: Room): void {
    delete this.networks[room.name];
    delete this.lastNetworkUpdate[room.name];
    this.getLinkNetwork(room);
  }
}