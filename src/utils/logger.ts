import pino from "pino";
import { createStream } from "rotating-file-stream";
import path from "path";
import os from "os";

const HOME_DIR = path.join(os.homedir(), ".subagent");

/**
 * Creates a pino logger with optional file rotation
 * @param options Configuration options for the logger
 * @returns Configured pino logger instance
 */
export function createLogger(options: {
  enabled?: boolean;
  level?: string;
  toFile?: boolean;
} = {}) {
  const { enabled = true, level = "info", toFile = false } = options;

  if (!enabled) {
    return pino({ enabled: false });
  }

  // For CLI tools, we want simple console output by default
  if (!toFile) {
    return pino({
      level,
    });
  }

  // File-based logging with rotation (useful for long-running processes)
  const pad = (num: number) => (num > 9 ? "" : "0") + num;
  const generator = (time: Date | number | null, index?: number) => {
    const date = time instanceof Date ? time : (time ? new Date(time) : new Date());
    const month = date.getFullYear() + "" + pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    return `./logs/subagent-${month}${day}${hour}${minute}${pad(date.getSeconds())}${index ? `_${index}` : ""}.log`;
  };

  const stream = createStream(generator, {
    path: HOME_DIR,
    maxFiles: 10,
    interval: "1d",
    compress: false,
    maxSize: "50M",
  });

  return pino({
    level,
  }, stream);
}

// Default logger instance for the CLI
export const logger = createLogger({ level: process.env.LOG_LEVEL || "info" });
