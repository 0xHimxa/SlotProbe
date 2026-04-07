/**
 * Config — Loader
 *
 * Discovers, loads, and merges SlotProbe configuration files. Searches
 * the current working directory for `.SlotProberc.json`, `.slotprobe.json`,
 * or `slotprobe.config.json` and validates the contents with the Zod schema.
 * Missing config files fall back silently to built-in defaults.
 *
 * @module config/loader
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { ConfigSchema, DEFAULT_CONFIG, type Config } from './schema.js'

const CONFIG_FILES = [
  '.SlotProberc.json',
  '.slotprobe.json',
  'slotprobe.config.json',
]

/**
 * Loads configuration from the nearest config file.
 * Searches up the directory tree from the current working directory.
 */
export function loadConfig(searchDir?: string): Config {
  const searchPath = searchDir ?? process.cwd()

  for (const filename of CONFIG_FILES) {
    const configPath = join(searchPath, filename)
    if (existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
        const result = ConfigSchema.safeParse(raw)
        if (result.success) {
          console.log(`Loaded config from: ${configPath}`)
          return result.data
        } else {
          console.warn(`Invalid config in ${configPath}:`, result.error.message)
        }
      } catch (error) {
        console.warn(`Failed to read config from ${configPath}:`, error)
      }
    }
  }

  console.log('Using default config')
  return DEFAULT_CONFIG
}

/**
 * Loads config from a specific file path.
 */
export function loadConfigFromPath(configPath: string): Config {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`)
  }

  const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
  const result = ConfigSchema.safeParse(raw)

  if (!result.success) {
    throw new Error(`Invalid config: ${result.error.message}`)
  }

  return result.data
}

/**
 * Gets the path to the nearest config file.
 */
export function findConfigPath(searchDir?: string): string | null {
  const searchPath = searchDir ?? process.cwd()

  for (const filename of CONFIG_FILES) {
    const configPath = join(searchPath, filename)
    if (existsSync(configPath)) {
      return configPath
    }
  }

  return null
}

/**
 * Merges multiple configs, with later configs taking precedence.
 */
export function mergeConfigs(...configs: Partial<Config>[]): Config {
  let merged = { ...DEFAULT_CONFIG }

  for (const config of configs) {
    if (config.rpc) {
      merged.rpc = { ...merged.rpc, ...config.rpc }
    }
    if (config.output) {
      merged.output = config.output
    }
    if (config.chains) {
      merged.chains = { ...merged.chains, ...config.chains }
    }
  }

  return merged
}
