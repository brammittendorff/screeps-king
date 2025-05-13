/**
 * Task Manager
 * Handles task creation, assignment, and execution
 */

export enum TaskType {
  Harvest = 'harvest',
  Upgrade = 'upgrade',
  Build = 'build',
  Repair = 'repair',
  Transfer = 'transfer',
  Withdraw = 'withdraw',
  Pickup = 'pickup',
  Attack = 'attack',
  Heal = 'heal',
  RangedAttack = 'ranged_attack',
  Dismantle = 'dismantle',
  ClaimController = 'claim_controller',
  ReserveController = 'reserve_controller'
}

export enum TaskStatus {
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed'
}

export interface Task {
  id: string;
  type: TaskType;
  targetId: Id<any>;
  priority: number;
  assignedCreeps: string[];
  roomName: string;
  createdAt: number;
  resourceType?: ResourceConstant;
  amount?: number;
  data?: any;
}

export class TaskManager {
  private static tasks: Record<string, Task> = {};
  private static creepTasks: Record<string, string> = {};
  // Analytics: track task completion, failures, idle time
  private static taskStats: { completed: number; failed: number; idle: number } = { completed: 0, failed: 0, idle: 0 };
  
  /**
   * Initialize the task manager
   */
  public static init(): void {
    // Initialize tasks from Memory if needed
    if (!Memory.tasks) {
      Memory.tasks = {};
    }
    
    // Load tasks from Memory
    this.tasks = Memory.tasks as any;
    
    // Rebuild creep task assignments
    this.creepTasks = {};
    for (const taskId in this.tasks) {
      const task = this.tasks[taskId];
      for (const creepName of task.assignedCreeps) {
        this.creepTasks[creepName] = taskId;
      }
    }
  }
  
  /**
   * Save tasks to Memory
   */
  public static save(): void {
    // Only save active tasks (not completed/invalid/old)
    const prunedTasks: Record<string, Task> = {};
    for (const id in this.tasks) {
      const task = this.tasks[id];
      // Only keep tasks less than 300 ticks old and with valid targets
      const target = Game.getObjectById(task.targetId);
      if (Game.time - task.createdAt < 300 && target) {
        prunedTasks[id] = task;
      }
    }
    Memory.tasks = prunedTasks as any;
  }
  
  /**
   * Create a new task
   */
  public static createTask(
    type: TaskType,
    targetId: Id<any>,
    priority: number,
    roomName: string,
    data: any = {}
  ): string {
    const id = `${type}_${Game.time}_${Math.floor(Math.random() * 10000)}`;
    
    this.tasks[id] = {
      id,
      type,
      targetId,
      priority,
      assignedCreeps: [],
      roomName,
      createdAt: Game.time,
      ...data
    };
    
    return id;
  }
  
  /**
   * Assign a task to a creep
   */
  public static assignTask(creepName: string, taskId: string): boolean {
    // Check if task exists
    if (!this.tasks[taskId]) {
      return false;
    }
    
    // Check if creep exists
    if (!Game.creeps[creepName]) {
      return false;
    }
    
    // Unassign any previous task
    this.unassignCreep(creepName);
    
    // Assign the task
    this.tasks[taskId].assignedCreeps.push(creepName);
    this.creepTasks[creepName] = taskId;
    
    return true;
  }
  
  /**
   * Unassign a creep from its task
   */
  public static unassignCreep(creepName: string): void {
    const taskId = this.creepTasks[creepName];
    if (!taskId) return;
    
    // Remove the creep from the task
    if (this.tasks[taskId]) {
      this.tasks[taskId].assignedCreeps = this.tasks[taskId].assignedCreeps.filter(
        (name) => name !== creepName
      );
      
      // Remove the task if no more creeps are assigned
      if (this.tasks[taskId].assignedCreeps.length === 0) {
        this.removeTask(taskId);
      }
    }
    
    // Remove the assignment
    delete this.creepTasks[creepName];
  }
  
  /**
   * Get a task by ID
   */
  public static getTask(taskId: string): Task | null {
    return this.tasks[taskId] || null;
  }
  
  /**
   * Get the task assigned to a creep
   */
  public static getCreepTask(creepName: string): Task | null {
    const taskId = this.creepTasks[creepName];
    if (!taskId) return null;
    
    return this.tasks[taskId] || null;
  }
  
  /**
   * Find the best task for a creep
   * AI modules for builders, haulers, repairers, etc. should call this to get a task
   */
  public static findTaskForCreep(creep: Creep): Task | null {
    const room = creep.room;
    
    // Filter tasks by room and creep capabilities
    const availableTasks = Object.values(this.tasks).filter(task => {
      // Skip tasks that are already fully assigned
      // if (task.assignedCreeps.length > 0) return false;
      
      // Filter by room
      if (task.roomName !== room.name) return false;
      
      // Check if the creep can perform this task based on its body
      return this.canCreepPerformTask(creep, task);
    });
    
    // Sort by priority
    availableTasks.sort((a, b) => b.priority - a.priority);
    
    return availableTasks[0] || null;
  }
  
  /**
   * Check if a creep can perform a task
   */
  private static canCreepPerformTask(creep: Creep, task: Task): boolean {
    // Check based on task type and creep body
    switch (task.type) {
      case TaskType.Harvest:
        return creep.body.some(part => part.type === WORK);
      case TaskType.Upgrade:
        return creep.body.some(part => part.type === WORK);
      case TaskType.Build:
        return creep.body.some(part => part.type === WORK);
      case TaskType.Repair:
        return creep.body.some(part => part.type === WORK);
      case TaskType.Transfer:
        return creep.body.some(part => part.type === CARRY);
      case TaskType.Withdraw:
        return creep.body.some(part => part.type === CARRY);
      case TaskType.Pickup:
        return creep.body.some(part => part.type === CARRY);
      case TaskType.Attack:
        return creep.body.some(part => part.type === ATTACK);
      case TaskType.Heal:
        return creep.body.some(part => part.type === HEAL);
      case TaskType.RangedAttack:
        return creep.body.some(part => part.type === RANGED_ATTACK);
      case TaskType.Dismantle:
        return creep.body.some(part => part.type === WORK);
      case TaskType.ClaimController:
      case TaskType.ReserveController:
        return creep.body.some(part => part.type === CLAIM);
      default:
        return true;
    }
  }
  
  /**
   * Remove a task
   */
  public static removeTask(taskId: string): void {
    // Unassign all creeps
    if (this.tasks[taskId]) {
      for (const creepName of [...this.tasks[taskId].assignedCreeps]) {
        delete this.creepTasks[creepName];
      }
    }
    
    // Remove the task
    delete this.tasks[taskId];
  }
  
  /**
   * Execute a task and track analytics
   */
  public static executeTask(creep: Creep, task: Task): TaskStatus {
    let status: TaskStatus = TaskStatus.Failed;
    switch (task.type) {
      case TaskType.Harvest:
        status = this.executeHarvestTask(creep, Game.getObjectById(task.targetId) as Source);
        break;
      case TaskType.Upgrade:
        status = this.executeUpgradeTask(creep, Game.getObjectById(task.targetId) as StructureController);
        break;
      case TaskType.Build:
        status = this.executeBuildTask(creep, Game.getObjectById(task.targetId) as ConstructionSite);
        break;
      case TaskType.Repair:
        status = this.executeRepairTask(creep, Game.getObjectById(task.targetId) as Structure);
        break;
      case TaskType.Transfer:
        status = this.executeTransferTask(creep, Game.getObjectById(task.targetId) as Structure, task.resourceType!, task.amount);
        break;
      case TaskType.Withdraw:
        status = this.executeWithdrawTask(creep, Game.getObjectById(task.targetId) as Structure, task.resourceType!, task.amount);
        break;
      case TaskType.Pickup:
        status = this.executePickupTask(creep, Game.getObjectById(task.targetId) as Resource);
        break;
      // Add more task execution methods as needed
      default:
        status = TaskStatus.Failed;
    }
    // Track analytics
    if (status === TaskStatus.Completed) this.markCompleted();
    else if (status === TaskStatus.Failed) this.markFailed();
    return status;
  }
  
  /**
   * Execute a harvest task
   */
  private static executeHarvestTask(creep: Creep, source: Source): TaskStatus {
    // If creep is full, task is complete
    if (creep.store.getFreeCapacity() === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to harvest
    const result = creep.harvest(source);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(source, {
        visualizePathStyle: { stroke: '#ffaa00' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK) {
      return TaskStatus.InProgress;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute an upgrade task
   */
  private static executeUpgradeTask(creep: Creep, controller: StructureController): TaskStatus {
    // If creep is empty, task is complete
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to upgrade
    const result = creep.upgradeController(controller);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(controller, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK) {
      return TaskStatus.InProgress;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute a build task
   */
  private static executeBuildTask(creep: Creep, site: ConstructionSite): TaskStatus {
    // If creep is empty, task is complete
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to build
    const result = creep.build(site);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(site, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK) {
      return TaskStatus.InProgress;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute a repair task
   */
  private static executeRepairTask(creep: Creep, structure: Structure): TaskStatus {
    // If creep is empty, task is complete
    if (creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
      return TaskStatus.Completed;
    }
    
    // If structure is at full health, task is complete
    if (structure.hits === structure.hitsMax) {
      return TaskStatus.Completed;
    }
    
    // Try to repair
    const result = creep.repair(structure);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(structure, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK) {
      return TaskStatus.InProgress;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute a transfer task
   */
  private static executeTransferTask(
    creep: Creep, 
    structure: Structure, 
    resourceType: ResourceConstant,
    amount?: number
  ): TaskStatus {
    // If creep is empty, task is complete
    if (creep.store.getUsedCapacity(resourceType) === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to transfer
    const result = creep.transfer(
      structure, 
      resourceType, 
      amount || creep.store.getUsedCapacity(resourceType)
    );
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(structure, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK || result === ERR_FULL) {
      return TaskStatus.Completed;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute a withdraw task
   */
  private static executeWithdrawTask(
    creep: Creep, 
    structure: Structure, 
    resourceType: ResourceConstant,
    amount?: number
  ): TaskStatus {
    // If creep is full, task is complete
    if (creep.store.getFreeCapacity() === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to withdraw
    const result = creep.withdraw(
      structure as StructureWithStore, 
      resourceType, 
      amount
    );
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(structure, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK || result === ERR_NOT_ENOUGH_RESOURCES) {
      return TaskStatus.Completed;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Execute a pickup task
   */
  private static executePickupTask(creep: Creep, resource: Resource): TaskStatus {
    // If creep is full, task is complete
    if (creep.store.getFreeCapacity() === 0) {
      return TaskStatus.Completed;
    }
    
    // Try to pickup
    const result = creep.pickup(resource);
    
    if (result === ERR_NOT_IN_RANGE) {
      creep.moveTo(resource, {
        visualizePathStyle: { stroke: '#ffffff' },
        reusePath: 20
      });
      return TaskStatus.InProgress;
    } else if (result === OK) {
      return TaskStatus.Completed;
    } else {
      return TaskStatus.Failed;
    }
  }
  
  /**
   * Clean up completed or invalid tasks
   */
  public static cleanup(): void {
    for (const taskId in this.tasks) {
      const task = this.tasks[taskId];
      // Remove old tasks
      if (Game.time - task.createdAt > 300) {
        this.removeTask(taskId);
        continue;
      }
      // Check if target still exists
      const target = Game.getObjectById(task.targetId);
      if (!target) {
        this.removeTask(taskId);
        continue;
      }
      // Check for completed tasks
      if (task.type === TaskType.Build) {
        const site = target as ConstructionSite;
        if (site.progress >= site.progressTotal) {
          this.removeTask(taskId);
          continue;
        }
      } else if (task.type === TaskType.Repair) {
        const structure = target as Structure;
        if (structure.hits >= structure.hitsMax) {
          this.removeTask(taskId);
          continue;
        }
      }
      // Remove tasks with no assigned creeps and not a valid opportunity (e.g., transfer/withdraw/pickup with no resource/energy left)
      if (task.assignedCreeps.length === 0) {
        // For transfer/withdraw/pickup, check if still needed
        if (task.type === TaskType.Transfer || task.type === TaskType.Withdraw || task.type === TaskType.Pickup) {
          // If target is full/empty, remove
          if (task.type === TaskType.Transfer && (target as any).store && (target as any).store.getFreeCapacity && (target as any).store.getFreeCapacity(task.resourceType) === 0) {
            this.removeTask(taskId);
            continue;
          }
          if (task.type === TaskType.Withdraw && (target as any).store && (target as any).store.getUsedCapacity && (target as any).store.getUsedCapacity(task.resourceType) === 0) {
            this.removeTask(taskId);
            continue;
          }
          if (task.type === TaskType.Pickup && (target as any).amount === 0) {
            this.removeTask(taskId);
            continue;
          }
        } else {
          // For other types, remove if no assigned creeps
          this.removeTask(taskId);
          continue;
        }
      }
      // Clean up assigned creeps that no longer exist
      task.assignedCreeps = task.assignedCreeps.filter(
        (name) => Game.creeps[name]
      );
    }
    // Log task stats every 100 ticks
    if (Game.time % 100 === 0) {
      const total = Object.keys(this.tasks).length;
      const byType: Record<string, number> = {};
      for (const id in this.tasks) {
        const t = this.tasks[id];
        byType[t.type] = (byType[t.type] || 0) + 1;
      }
      console.log(`[TaskManager] Total tasks: ${total} | ` + Object.entries(byType).map(([type, count]) => `${type}: ${count}`).join(', '));
    }
  }
  
  /**
   * Mark a task as completed (analytics)
   */
  public static markCompleted(): void {
    this.taskStats.completed++;
  }
  
  /**
   * Mark a task as failed (analytics)
   */
  public static markFailed(): void {
    this.taskStats.failed++;
  }
  
  /**
   * Mark a creep as idle (analytics)
   */
  public static markIdle(): void {
    this.taskStats.idle++;
  }
  
  /**
   * Get analytics stats
   */
  public static getStats(): { completed: number; failed: number; idle: number } {
    return { ...this.taskStats };
  }
  
  /**
   * Log task analytics for easier tuning
   */
  public static logAnalytics(): void {
    if (Game.time % 100 !== 0) return;
    // Global stats
    const stats = this.getStats();
    // Per-room stats (optional, if tasks are tracked by room)
    const roomStats: Record<string, { created: number; assigned: number }> = {};
    for (const taskId in this.tasks) {
      const task = this.tasks[taskId];
      if (!roomStats[task.roomName]) roomStats[task.roomName] = { created: 0, assigned: 0 };
      roomStats[task.roomName].created++;
      roomStats[task.roomName].assigned += task.assignedCreeps.length;
    }
    for (const roomName in roomStats) {
      // Do NOT write analytics to Memory (keep in global only)
    }
  }
}