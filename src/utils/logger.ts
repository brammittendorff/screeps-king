/**
 * Logger utility with configurable log levels
 */

export enum LogLevel {
  ERROR = 0,
  WARNING = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private static level: LogLevel = LogLevel.INFO;
  private static persistKey = 'logLevel';
  private static colors = {
    ERROR: '#ff0000',   // Red
    WARN: '#ffaa00',    // Orange
    INFO: '#00aaff',    // Blue
    DEBUG: '#aaaaaa'    // Gray
  };

  /**
   * Initialize logger and load settings from memory
   */
  public static init(): void {
    // Load log level from Memory if available
    if (Memory[this.persistKey] !== undefined) {
      this.level = Memory[this.persistKey] as LogLevel;
    } else {
      // Default to INFO level
      Memory[this.persistKey] = this.level;
    }

    this.info(`Logger initialized with log level: ${LogLevel[this.level]}`, 'Logger');
  }

  /**
   * Set the log level and save to memory
   */
  public static setLevel(level: LogLevel): void {
    this.level = level;
    // Save to memory for persistence
    Memory[this.persistKey] = level;
    this.info(`Log level set to: ${LogLevel[level]}`, 'Logger');
  }

  /**
   * Log an error message
   */
  public static error(message: string, context?: string): void {
    // Always log errors regardless of level
    const contextStr = context ? `[${context}]` : '';
    console.log(`<span style="color:${this.colors.ERROR}">[ERROR]${contextStr} ${message}</span>`);
  }

  /**
   * Log a warning message
   */
  public static warn(message: string, context?: string): void {
    if (this.level >= LogLevel.WARNING) {
      const contextStr = context ? `[${context}]` : '';
      console.log(`<span style="color:${this.colors.WARN}">[WARN]${contextStr} ${message}</span>`);
    }
  }

  /**
   * Log an info message
   */
  public static info(message: string, context?: string): void {
    if (this.level >= LogLevel.INFO) {
      const contextStr = context ? `[${context}]` : '';
      console.log(`<span style="color:${this.colors.INFO}">[INFO]${contextStr} ${message}</span>`);
    }
  }

  /**
   * Log a debug message
   */
  public static debug(message: string, context?: string): void {
    if (this.level >= LogLevel.DEBUG) {
      const contextStr = context ? `[${context}]` : '';
      console.log(`<span style="color:${this.colors.DEBUG}">[DEBUG]${contextStr} ${message}</span>`);
    }
  }

  /**
   * Get the current log level
   */
  public static getLevel(): LogLevel {
    return this.level;
  }

  /**
   * Get the current log level name
   */
  public static getLevelName(): string {
    return LogLevel[this.level];
  }

  /**
   * Add a global command to change log level
   */
  public static setupGlobalCommands(): void {
    // @ts-ignore - adding to global object
    global.setLogLevel = (level: string | number): void => {
      let newLevel: LogLevel;

      if (typeof level === 'string') {
        // Try to parse string to LogLevel
        const levelName = level.toUpperCase();
        if (LogLevel[levelName] !== undefined) {
          newLevel = LogLevel[levelName] as unknown as LogLevel;
        } else {
          // Try parsing as number
          const levelNum = parseInt(level, 10);
          if (!isNaN(levelNum) && levelNum >= 0 && levelNum <= 3) {
            newLevel = levelNum;
          } else {
            console.log(`Invalid log level: ${level}. Valid values are ERROR, WARNING, INFO, DEBUG or 0-3`);
            return;
          }
        }
      } else if (typeof level === 'number') {
        if (level >= 0 && level <= 3) {
          newLevel = level;
        } else {
          console.log(`Invalid log level: ${level}. Valid values are 0-3`);
          return;
        }
      } else {
        console.log(`Invalid log level: ${level}. Valid values are ERROR, WARNING, INFO, DEBUG or 0-3`);
        return;
      }

      this.setLevel(newLevel);
    };
  }

  public static warning(message: string) {
    this.info('[WARNING] ' + message);
  }
  
  /**
   * Log a critical error message
   */
  public static critical(message: string, context?: string): void {
    // Always log critical errors regardless of level
    const contextStr = context ? `[${context}]` : '';
    console.log(`<span style="color:${this.colors.ERROR};font-weight:bold">[CRITICAL]${contextStr} ${message}</span>`);
  }
}