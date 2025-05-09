/**
 * CPU Profiler utility
 * Helps track and optimize CPU usage
 */

import { Logger } from './logger';

interface ProfilerData {
  calls: number;
  totalCpu: number;
  lastCpu: number;
}

export class Profiler {
  private static enabled: boolean = false;
  private static data: Record<string, ProfilerData> = {};
  
  /**
   * Enable the profiler
   */
  public static enable(): void {
    this.enabled = true;
    this.data = {};
    Logger.info('CPU Profiler enabled');
  }
  
  /**
   * Disable the profiler
   */
  public static disable(): void {
    this.enabled = false;
    Logger.info('CPU Profiler disabled');
  }
  
  /**
   * Profile a function execution - can be used as a method wrapper or decorator
   */
  public static wrap(name: string, fn?: any): any {
    // When used as a method decorator
    if (fn === undefined) {
      return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;
        descriptor.value = function(...args: any[]) {
          const start = Game.cpu.getUsed();
          const result = originalMethod.apply(this, args);
          const end = Game.cpu.getUsed();
          const used = end - start;

          if (!Profiler.enabled) return result;

          // Record the profiling data
          if (!Profiler.data[name]) {
            Profiler.data[name] = {
              calls: 0,
              totalCpu: 0,
              lastCpu: 0
            };
          }

          Profiler.data[name].calls++;
          Profiler.data[name].totalCpu += used;
          Profiler.data[name].lastCpu = used;

          return result;
        };
        return descriptor;
      };
    }

    // When used as a function wrapper
    // If profiler is disabled, return the original function
    if (!this.enabled) {
      return fn;
    }
    
    // Return a wrapped function that tracks CPU usage
    return ((...args: any[]) => {
      const start = Game.cpu.getUsed();
      const result = fn(...args);
      const end = Game.cpu.getUsed();
      const used = end - start;

      // Record profiling data
      if (!this.data[name]) {
        this.data[name] = {
          calls: 0,
          totalCpu: 0,
          lastCpu: 0
        };
      }

      this.data[name].calls++;
      this.data[name].totalCpu += used;
      this.data[name].lastCpu = used;

      return result;
    });
  }
  
  /**
   * Start measuring a code block
   */
  public static start(name: string): void {
    if (!this.enabled) return;
    
    // Store start time in Memory
    (Memory as any)._profiler = (Memory as any)._profiler || {};
    (Memory as any)._profiler[name] = Game.cpu.getUsed();
  }
  
  /**
   * End measuring a code block
   */
  public static end(name: string): number {
    if (!this.enabled) return 0;
    
    // Get start time from Memory
    if (!(Memory as any)._profiler || !(Memory as any)._profiler[name]) {
      return 0;
    }
    
    const startCpu = (Memory as any)._profiler[name];
    const endCpu = Game.cpu.getUsed();
    const used = endCpu - startCpu;
    
    // Record profiling data
    if (!this.data[name]) {
      this.data[name] = {
        calls: 0,
        totalCpu: 0,
        lastCpu: 0
      };
    }
    
    this.data[name].calls++;
    this.data[name].totalCpu += used;
    this.data[name].lastCpu = used;
    
    // Clean up Memory
    delete (Memory as any)._profiler[name];
    
    return used;
  }
  
  /**
   * Generate a report of CPU usage
   */
  public static report(): void {
    if (!this.enabled || Object.keys(this.data).length === 0) {
      Logger.info('No profiling data available');
      return;
    }
    
    // Sort functions by total CPU usage
    const sortedData = Object.entries(this.data).sort(
      ([, a], [, b]) => b.totalCpu - a.totalCpu
    );
    
    // Calculate total CPU
    const totalCpu = Object.values(this.data).reduce(
      (sum, data) => sum + data.totalCpu, 0
    );
    
    Logger.info('============= CPU Profiler Report =============');
    Logger.info('Function\tCalls\tTotal CPU\tAvg CPU\t% of Total');
    
    for (const [name, data] of sortedData) {
      const avgCpu = data.calls > 0 ? data.totalCpu / data.calls : 0;
      const percentage = totalCpu > 0 ? (data.totalCpu / totalCpu) * 100 : 0;
      
      Logger.info(
        `${name}\t${data.calls}\t${data.totalCpu.toFixed(2)}\t${avgCpu.toFixed(2)}\t${percentage.toFixed(1)}%`
      );
    }
    
    Logger.info(`Total CPU tracked: ${totalCpu.toFixed(2)}`);
    Logger.info('================================================');
  }
}