import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { ConfigSchema, DEFAULT_CONFIG } from '../../config/schema.js'
import {
  buildDefaultConfigFile,
  clearConfigCache,
  initConfigFile,
  loadConfig,
  mergeConfigs,
  resolveInputPath,
  resolveOutputPath,
} from '../../config/loader.js'

let tempDir: string

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'slotprobe-config-'))
  clearConfigCache()
})

afterEach(() => {
  clearConfigCache()
  rmSync(tempDir, { recursive: true, force: true })
})

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

  it('throws a helpful error when no config file exists', () => {
    expect(() => loadConfig(tempDir)).toThrow(/Run "slotprobe init" to create slotprobe\.config\.json/)
  })

  it('writes a starter config file during init', () => {
    const configPath = initConfigFile(tempDir)

    expect(existsSync(configPath)).toBe(true)

    const raw = JSON.parse(readFileSync(configPath, 'utf-8'))
    expect(raw.defaultChain).toBe(DEFAULT_CONFIG.defaultChain)
    expect(raw.rpcConfig).toEqual(DEFAULT_CONFIG.rpc)
    expect(raw.artifactsDir).toBe(DEFAULT_CONFIG.artifactsDir)
    expect(raw.snapshotsDir).toBe(DEFAULT_CONFIG.snapshotsDir)
    expect(raw.chains.mainnet).toContain('your-api-key')
  })

  it('refuses to overwrite an existing config during init', () => {
    writeFileSync(join(tempDir, 'slotprobe.config.json'), buildDefaultConfigFile(), 'utf-8')

    expect(() => initConfigFile(tempDir)).toThrow(/Configuration already exists/)
  })
})
