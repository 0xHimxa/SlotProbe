/**
 * Config - Schema
 * 
 * Zod schema for .SlotProberc.json configuration file.
 */

import { z } from 'zod'

export const RpcConfigSchema = z.object({
  /** Maximum concurrent RPC calls */
  maxConcurrent: z.number().min(1).max(100).default(50),
  /** Number of retry attempts on failure */
  retries: z.number().min(0).max(10).default(3),
  /** Initial backoff in milliseconds */
  backoffMs: z.number().min(100).max(30000).default(1000),
})

export type RpcConfig = z.infer<typeof RpcConfigSchema>

export const ConfigSchema = z.object({
  /** RPC configuration */
  rpc: RpcConfigSchema.default({
    maxConcurrent: 50,
    retries: 3,
    backoffMs: 1000,
  }),
  /** Default output format */
  output: z.enum(['terminal', 'json', 'markdown']).default('terminal'),
  /** Chain-specific RPC URLs */
  chains: z.record(z.string(), z.string()).optional(),
})

export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  rpc: {
    maxConcurrent: 50,
    retries: 3,
    backoffMs: 1000,
  },
  output: 'terminal',
}
