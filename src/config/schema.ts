/**
 * Config — Zod Schema
 *
 * Defines the runtime-validated schema for the `.SlotProberc.json`
 * configuration file. All fields have sensible defaults so the file
 * is entirely optional — SlotProbe works out of the box with zero config.
 *
 * @module config/schema
 */

import { z } from 'zod'

/**
 * Runtime knobs for outbound RPC traffic.
 *
 * These settings affect both individual slot reads and batched capture
 * traversals. They are intentionally kept small and operational:
 * concurrency, retry budget, and backoff timing.
 */
export const RpcConfigSchema = z.object({
  /** Maximum concurrent RPC calls */
  maxConcurrent: z.number().min(1).max(100).default(50),
  /** Number of retry attempts on failure */
  retries: z.number().min(0).max(10).default(3),
  /** Initial backoff in milliseconds */
  backoffMs: z.number().min(100).max(30000).default(1000),
})

export type RpcConfig = z.infer<typeof RpcConfigSchema>

/**
 * Canonical configuration shape consumed by the application at runtime.
 *
 * The README has always described `defaultChain`, `rpcConfig`,
 * `artifactsDir`, and `snapshotsDir`, while earlier code revisions only
 * implemented a narrower `{ rpc, output, chains }` shape. The transform
 * below accepts both variants and normalises them into one production
 * shape so existing users do not break when upgrading.
 */
const RawConfigSchema = z.object({
  /** Preferred default chain for snapshot-oriented commands */
  defaultChain: z.string().optional(),
  /** README-aligned RPC tuning section */
  rpcConfig: RpcConfigSchema.optional(),
  /** Backward-compatible alias accepted by older configs */
  rpc: RpcConfigSchema.optional(),
  /** Default output format for commands that support `--output` */
  output: z.enum(['terminal', 'json', 'markdown']).optional(),
  /** Chain-specific RPC URL overrides */
  chains: z.record(z.string(), z.string()).optional(),
  /** Default directory for build artifacts */
  artifactsDir: z.string().optional(),
  /** Default directory for generated snapshots */
  snapshotsDir: z.string().optional(),
}).transform((raw) => ({
  defaultChain: raw.defaultChain ?? 'mainnet',
  rpc: raw.rpcConfig ?? raw.rpc ?? {
    maxConcurrent: 50,
    retries: 3,
    backoffMs: 1000,
  },
  output: raw.output ?? 'terminal',
  chains: raw.chains,
  artifactsDir: raw.artifactsDir ?? './out',
  snapshotsDir: raw.snapshotsDir ?? './snapshots',
}))

export const ConfigSchema = RawConfigSchema

export type Config = z.infer<typeof ConfigSchema>

export const DEFAULT_CONFIG: Config = {
  defaultChain: 'mainnet',
  rpc: {
    maxConcurrent: 50,
    retries: 3,
    backoffMs: 1000,
  },
  output: 'terminal',
  chains: undefined,
  artifactsDir: './out',
  snapshotsDir: './snapshots',
 
}
