import fs from "fs/promises";
import JSON5 from "json5";
import path from "path";
import os from "os";

const CONFIG_DIR = path.join(os.homedir(), ".subagent");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

/**
 * Simple config structure for subagent
 */
export interface SubagentConfig {
  logLevel?: string;
  templatesDir?: string;
  [key: string]: any;
}

/**
 * Interpolates environment variables in strings
 * Supports both ${VAR_NAME} and $VAR_NAME syntax
 */
const interpolateEnvVars = (obj: any): any => {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      return process.env[varName] || match;
    });
  } else if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  } else if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateEnvVars(value);
    }
    return result;
  }
  return obj;
};

/**
 * Reads the subagent configuration file
 * Returns empty config if file doesn't exist
 */
export async function readConfig(): Promise<SubagentConfig> {
  try {
    const content = await fs.readFile(CONFIG_FILE, "utf-8");
    const parsed = JSON5.parse(content);
    return interpolateEnvVars(parsed);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw new Error(`Failed to read config: ${error.message}`);
  }
}

/**
 * Writes the subagent configuration file
 * Creates the config directory if it doesn't exist
 */
export async function writeConfig(config: SubagentConfig): Promise<void> {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(CONFIG_FILE, content, "utf-8");
  } catch (error: any) {
    throw new Error(`Failed to write config: ${error.message}`);
  }
}

/**
 * Gets the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
