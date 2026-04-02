/**
 * Config Module
 * 
 * Handles configuration loading and validation.
 */

export { loadConfig, loadConfigFromPath, findConfigPath, mergeConfigs } from './loader.js'
export { ConfigSchema, RpcConfigSchema, DEFAULT_CONFIG, type Config, type RpcConfig } from './schema.js'
