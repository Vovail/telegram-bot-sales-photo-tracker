import { LogEntry } from "../types/index.js";

type LogData = Omit<LogEntry, "timestamp" | "level" | "event">;

export class Logger {
  private log(level: LogEntry["level"], event: string, data?: LogData): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      event,
      ...data,
    };

    const json = JSON.stringify(entry, (_key, value) =>
      value instanceof Date ? value.toISOString() : value,
    );

    switch (level) {
      case "info":
        console.log(json);
        break;
      case "warn":
        console.warn(json);
        break;
      case "error":
        console.error(json);
        break;
    }
  }

  info(event: string, data?: LogData): void {
    this.log("info", event, data);
  }

  warn(event: string, data?: LogData): void {
    this.log("warn", event, data);
  }

  error(event: string, data?: LogData): void {
    this.log("error", event, data);
  }
}
