import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSON5 from 'json5';

const CONFIG_DIR = path.join(os.homedir(), '.subagent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Simple config structure for subagent
 */
export interface SubagentConfig {
  logLevel?: string;
  templatesDir?: string;
  [key: string]: unknown;
}

/**
 * Interpolates environment variables in strings
 * Supports both ${VAR_NAME} and $VAR_NAME syntax
 */
const interpolateEnvVars = (obj: unknown): unknown => {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, braced, unbraced) => {
      const varName = braced || unbraced;
      return process.env[varName] || match;
    });
  }
  if (Array.isArray(obj)) {
    return obj.map(interpolateEnvVars);
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
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
    const content = await fs.readFile(CONFIG_FILE, 'utf-8');
    const parsed = JSON5.parse(content);
    return interpolateEnvVars(parsed) as SubagentConfig;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return {};
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config: ${message}`);
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
    await fs.writeFile(CONFIG_FILE, content, 'utf-8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write config: ${message}`);
  }
}

/**
 * Gets the config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}
