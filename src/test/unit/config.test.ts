import { describe, expect, it } from 'vitest'

import { ConfigSchema, DEFAULT_CONFIG } from '../../config/schema.js'
import { mergeConfigs, resolveInputPath, resolveOutputPath } from '../../config/loader.js'

describe('config schema', () => {
  it('accepts the README configuration shape and normalizes it to the runtime config', () => {
    const parsed = ConfigSchema.parse({
      defaultChain: 'base',
      rpcConfig: {
        maxConcurrent: 12,
        retries: 5,
        backoffMs: 1500,
      },
      chains: {
        base: 'https://base.example',
      },
      artifactsDir: './artifacts',
      snapshotsDir: './snapshots',
      output: 'markdown',
    })

    expect(parsed).toEqual({
      defaultChain: 'base',
      rpc: {
        maxConcurrent: 12,
        retries: 5,
        backoffMs: 1500,
      },
      chains: {
        base: 'https://base.example',
      },
      artifactsDir: './artifacts',
      snapshotsDir: './snapshots',
      output: 'markdown',
    })
  })

  it('accepts the legacy rpc key for backward compatibility', () => {
    const parsed = ConfigSchema.parse({
      rpc: {
        maxConcurrent: 11,
        retries: 2,
        backoffMs: 1200,
      },
    })

    expect(parsed.rpc).toEqual({
      maxConcurrent: 11,
      retries: 2,
      backoffMs: 1200,
    })
    expect(parsed.defaultChain).toBe(DEFAULT_CONFIG.defaultChain)
  })
})

describe('config helpers', () => {
  it('merges runtime config fields without dropping README-aligned keys', () => {
    const merged = mergeConfigs(
      DEFAULT_CONFIG,
      {
        defaultChain: 'arbitrum',
        snapshotsDir: './custom-snaps',
      },
      {
        rpc: {
          maxConcurrent: 60,
        },
      }
    )

    expect(merged.defaultChain).toBe('arbitrum')
    expect(merged.snapshotsDir).toBe('./custom-snaps')
    expect(merged.rpc.maxConcurrent).toBe(60)
    expect(merged.rpc.retries).toBe(DEFAULT_CONFIG.rpc.retries)
  })

  it('leaves unresolved input paths unchanged when no configured file exists', () => {
    expect(resolveInputPath('missing.json', './snapshots')).toBe('missing.json')
  })

  it('resolves bare output filenames into the configured base directory', () => {
    expect(resolveOutputPath('snapshot.json', './snapshots')).toBe('snapshots/snapshot.json')
    expect(resolveOutputPath('./nested/snapshot.json', './snapshots')).toBe('./nested/snapshot.json')
  })
})
