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
import { join, dirname, isAbsolute } from 'node:path'
import { ConfigSchema, DEFAULT_CONFIG, type Config } from './schema.js'

const CONFIG_FILES = [
  '.SlotProberc.json',
  '.slotprobe.json',
  'slotprobe.config.json',
]

/**
 * Small in-process cache keyed by the search directory passed to loadConfig.
 *
 * Snapshot capture can perform many storage reads in one CLI invocation, so
 * the storage engine must be able to ask for runtime config without
 * repeatedly hitting the filesystem or re-printing "Loaded config" noise.
 */
const configCache = new Map<string, Config>()

/**
 * Partial config shape used when composing overrides from multiple sources.
 *
 * The top-level config is partial and the nested RPC section is partial too,
 * so callers can override only one runtime knob without re-stating the
 * entire object.
 */
export type ConfigOverride = Omit<Partial<Config>, 'rpc'> & {
  rpc?: Partial<Config['rpc']>
}

/**
 * Loads configuration from the nearest config file.
 * Searches up the directory tree from the current working directory.
 */
export function loadConfig(searchDir?: string): Config {
  const searchPath = searchDir ?? process.cwd()
  const cached = configCache.get(searchPath)
  if (cached) {
    return cached
  }

  for (const filename of CONFIG_FILES) {
    const configPath = join(searchPath, filename)
    if (existsSync(configPath)) {
      try {
        const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
        const result = ConfigSchema.safeParse(raw)
        if (result.success) {
          configCache.set(searchPath, result.data)
          return result.data
        } else {
          console.warn(`Invalid config in ${configPath}:`, result.error.message)
        }
      } catch (error) {
        console.warn(`Failed to read config from ${configPath}:`, error)
      }
    }
  }

  configCache.set(searchPath, DEFAULT_CONFIG)
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
 * Clears the in-memory config cache.
 *
 * Primarily useful for tests that need to swap config fixtures at runtime.
 */
export function clearConfigCache(): void {
  configCache.clear()
}

/**
 * Resolves an input path against a configured base directory when useful.
 *
 * The caller may pass either a fully qualified/relative path, or a short
 * bare filename such as `before.json`. In the latter case, commands can use
 * this helper to look inside configured directories like `snapshotsDir` or
 * `artifactsDir` without breaking explicit user paths.
 */
export function resolveInputPath(inputPath: string, configuredDir?: string): string {
  if (!configuredDir || isAbsolute(inputPath) || existsSync(inputPath)) {
    return inputPath
  }

  const resolved = join(configuredDir, inputPath)
  return existsSync(resolved) ? resolved : inputPath
}

/**
 * Resolves an output path against a configured base directory.
 *
 * Unlike input resolution, output paths may not exist yet. To avoid
 * surprising callers, we only prepend the configured directory for bare
 * filenames. Explicit relative paths such as `./tmp/out.json` remain
 * untouched.
 */
export function resolveOutputPath(outputPath: string, configuredDir?: string): string {
  if (!configuredDir || isAbsolute(outputPath) || dirname(outputPath) !== '.') {
    return outputPath
  }

  return join(configuredDir, outputPath)
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
export function mergeConfigs(...configs: ConfigOverride[]): Config {
  let merged = { ...DEFAULT_CONFIG }

  for (const config of configs) {
    if (config.defaultChain) {
      merged.defaultChain = config.defaultChain
    }
    if (config.rpc) {
      merged.rpc = { ...merged.rpc, ...config.rpc }
    }
    if (config.output) {
      merged.output = config.output
    }
    if (config.chains) {
      merged.chains = { ...merged.chains, ...config.chains }
    }
    if (config.artifactsDir) {
      merged.artifactsDir = config.artifactsDir
    }
    if (config.snapshotsDir) {
      merged.snapshotsDir = config.snapshotsDir
    }
  }

  return merged
}
