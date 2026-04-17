/**
 * CLI Command — snapshot
 *
 * Captures a semantic storage snapshot of a deployed smart contract.
 *
 * The command reads the compiled storage layout from a Foundry or Hardhat
 * build artifact, resolves each variable's slot position, fetches the raw
 * 32-byte value from chain via `eth_getStorageAt`, and decodes it into a
 * human-readable representation. Results are written to a JSON snapshot
 * file that can later be diffed or used for migration generation.
 *
 * Supports:
 *   --only        Filter to specific variable names
 *   --mapping-keys  Supply keys for mapping expansion
 *   --dry-run     Preview what would be read without making RPC calls
 *   --block       Read state at a specific historical block
 *   --rpc         Override the default RPC URL for the target chain
 *   --output      Choose output format (terminal, json, markdown)
 *
 * @example
 *   slotprobe snapshot 0xA0b8...C4C4 --chain mainnet --artifact ./out/Pool.json --out before.json
 *   slotprobe snapshot 0xA0b8...C4C4 --chain mainnet --dry-run --artifact ./out/Pool.json
 */

import { Command } from 'commander'
import ora from 'ora'
import chalk from 'chalk'

import { captureSnapshot, dryRunCapture } from '../../core/snapshot/capture.js'
import { loadMappingKeys, validateMappingKeys } from '../../core/snapshot/mapping-keys.js'
import { loadConfig, resolveInputPath, resolveOutputPath } from '../../config/loader.js'
import type { SupportedChain } from '../../rpc/client.js'
import type { MappingKeysFile } from '../../core/snapshot/mapping-keys.js'

/**
 * Validates that the supplied chain name is one of the supported chains.
 *
 * @param chain - User-supplied chain string from the CLI flag
 * @returns The validated chain name cast to the SupportedChain union
 * @throws Error if the chain name is not recognised
 */
function validateChain(chain: string): SupportedChain {
  const supported: SupportedChain[] = [
    'mainnet',
    'sepolia',
    'arbitrum',
    'arbitrumSepolia',
    'base',
    'baseSepolia',
    'optimism',
    'optimismSepolia',
    'polygon',
    'polygonAmoy',
  ]
  if (!supported.includes(chain as SupportedChain)) {
    throw new Error(
      `Unsupported chain "${chain}". Supported chains: ${supported.join(', ')}`
    )
  }
  return chain as SupportedChain
}

/**
 * Validates and normalises the contract address into a checksummed 0x-prefixed
 * hex string. This is a lightweight check — full checksum validation happens
 * inside viem when the address is used for RPC calls.
 *
 * @param address - Raw address string from CLI argument
 * @returns The address cast to the `0x${string}` branded type
 * @throws Error if the address doesn't look like a valid Ethereum address
 */
function validateAddress(address: string): `0x${string}` {
  if (!address.startsWith('0x') || address.length !== 42) {
    throw new Error(`Invalid contract address: "${address}". Must be a 42-character 0x-prefixed hex string.`)
  }
  return address as `0x${string}`
}

export const snapshotCommand = new Command('snapshot')
  .description('Capture a semantic storage snapshot of a deployed contract')
  .argument('<address>', 'Contract address (0x...)')
  .requiredOption('--artifact <path>', 'Path to Foundry or Hardhat build artifact JSON')
  .option(
    '--chain <chain>',
    'Target chain (mainnet, sepolia, arbitrum, arbitrumSepolia, optimism, optimismSepolia, polygon, polygonAmoy, base, baseSepolia)'
  )
  .option('--block <number>', 'Block number for snapshot (defaults to latest)')
  .option('--only <vars>', 'Comma-separated list of variable names to snapshot')
  .option('--mapping-keys <path>', 'Path to mapping keys JSON file')
  .option('--out <path>', 'Output file path for snapshot JSON', 'snapshot.json')
  .option('--rpc <url>', 'Custom RPC URL')
  .option('--dry-run', 'Preview what would be captured without reading storage', false)
  .option('--output <format>', 'Output format (terminal, json, markdown)')
  .action(async (address: string, options) => {
    const spinner = ora()

    try {
      /* ---------------------------------------------------------------
       * 1. Validate inputs
       * ------------------------------------------------------------- */
      const validAddress = validateAddress(address)
      const config = loadConfig()
      const chain = validateChain((options.chain as string | undefined) ?? config.defaultChain)
      const artifactPath = resolveInputPath(options.artifact as string, config.artifactsDir)
      const outPath = resolveOutputPath(
        (options.out as string | undefined) ?? 'snapshot.json',
        config.snapshotsDir
      )

      /* ---------------------------------------------------------------
       * 2. Parse optional flags into typed values
       * ------------------------------------------------------------- */
      const only = options.only
        ? (options.only as string).split(',').map((v: string) => v.trim())
        : undefined

      const blockNumber = options.block ? BigInt(options.block) : undefined

      /** Load and validate mapping keys when the flag is provided */
      let mappingKeys: MappingKeysFile | undefined
      if (options.mappingKeys) {
        const mappingKeysPath = resolveInputPath(options.mappingKeys as string, config.snapshotsDir)
        mappingKeys = loadMappingKeys(mappingKeysPath)
        const validation = validateMappingKeys(mappingKeys)
        if (!validation.valid) {
          console.error(chalk.red(`Invalid mapping keys file:`))
          for (const err of validation.errors) {
            console.error(chalk.red(`  • ${err}`))
          }
          process.exit(1)
        }
      }

      /** Resolve RPC URL: CLI flag → config chain URL → viem default */
      const rpcUrl = (options.rpc as string | undefined)
        ?? config.chains?.[chain]
        ?? undefined
      /* ---------------------------------------------------------------
       * 3. Build capture options shared by both dry-run and real capture
       * ------------------------------------------------------------- */
      const captureOptions = {
        address: validAddress,
        artifactPath,
        chain,
        blockNumber,
        rpcUrl,
        only,
        mappingKeys,
        outPath,
        dryRun: options.dryRun as boolean,
      }

      /* ---------------------------------------------------------------
       * 4a. Dry-run path — print estimates without reading storage
       * ------------------------------------------------------------- */
      if (captureOptions.dryRun) {
        console.log(chalk.cyan('🔍 Dry-run mode — no RPC calls will be made\n'))
        const result = dryRunCapture(captureOptions)
        console.log(chalk.dim(`\nDone. ${result.variableCount} variable(s), ~${result.rpcCallsEstimate} slot read(s).`))
        return
      }

      /* ---------------------------------------------------------------
       * 4b. Real capture — read storage and save snapshot
       * ------------------------------------------------------------- */
      spinner.start(`Reading storage for ${validAddress} on ${chain}...`)

      const snapshot = await captureSnapshot(captureOptions)

      spinner.succeed(
        `Snapshot captured: ${snapshot.variables.length} variable(s) ` +
        `at block ${snapshot.blockNumber}`
      )

      console.log(chalk.green(`\n✅ Snapshot saved to ${captureOptions.outPath}`))
      console.log(chalk.dim(`   Contract: ${snapshot.contractName}`))
      console.log(chalk.dim(`   Chain:    ${snapshot.chain}`))
      console.log(chalk.dim(`   Block:    ${snapshot.blockNumber}`))
      console.log(chalk.dim(`   Variables: ${snapshot.variables.length}`))

    } catch (error) {
      spinner.fail('Snapshot failed')
      console.error(chalk.red(error instanceof Error ? error.message : String(error)))
      process.exit(1)
    }
  })
