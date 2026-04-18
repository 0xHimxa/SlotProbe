/**
 * RPC Client Factory
 *
 * Creates viem public clients for different EVM chains. These clients
 * are used by the storage engine to read contract storage via the
 * `eth_getStorageAt` JSON-RPC method. Each client is configured with
 * multicall batching to reduce the number of HTTP round-trips.
 *
 * Supported chains: Ethereum mainnet and Sepolia, Arbitrum and Arbitrum
 * Sepolia, Base and Base Sepolia, Optimism and Optimism Sepolia, Polygon
 * and Polygon Amoy. Add custom chains by extending the CHAINS constant.
 *
 * @module rpc/client
 */

import { createPublicClient, http, type Chain } from 'viem'
import {
  mainnet,
  sepolia,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
} from 'viem/chains'

export type SupportedChain =
  | 'mainnet'
  | 'sepolia'
  | 'arbitrum'
  | 'arbitrumSepolia'
  | 'base'
  | 'baseSepolia'
  | 'optimism'
  | 'optimismSepolia'
  | 'polygon'
  | 'polygonAmoy'

/** Supported chains for snapshot operations */
const CHAINS: Record<SupportedChain, Chain> = {
  mainnet,
  sepolia,
  arbitrum,
  arbitrumSepolia,
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
}
const DEFAULT_MULTICALL_BATCH_SIZE = 400
const DEFAULT_MULTICALL_WAIT_MS = 2000

/** Chain configuration map - add custom chains here */
export const CHAIN_CONFIG = CHAINS

function resolveRpcUrl(chain: SupportedChain, rpcUrl?: string): string {
  if (rpcUrl) {
    return rpcUrl
  }

  const defaultRpcUrl = CHAINS[chain].rpcUrls.default.http[0]
  if (!defaultRpcUrl) {
    throw new Error(`No default RPC URL configured for chain "${chain}"`)
  }

  return defaultRpcUrl
}

/**
 * Creates a viem public client for the specified chain.
 *
 * The client is configured with multicall batching for efficient bulk
 * reads and falls back to the chain's default public RPC if no custom
 * URL is provided. Public RPCs have rate limits — for production use,
 * supply a private RPC URL from Alchemy, Infura, or similar.
 *
 * @param chain  - One of the supported chain names
 * @param rpcUrl - Optional custom RPC URL (overrides default)
 * @returns A viem PublicClient configured for the target chain
 *
 * @example
 *   const client = getClient('mainnet')
 *   const storageValue = await client.getStorageAt({ address, slot })
 */
export function getClient(chain: SupportedChain, rpcUrl?: string) {
  const chainConfig = CHAINS[chain]
  const transport = http(resolveRpcUrl(chain, rpcUrl))
  
  return createPublicClient({
    chain: chainConfig,
    batch: {
      multicall: {
        batchSize: DEFAULT_MULTICALL_BATCH_SIZE,
        wait: DEFAULT_MULTICALL_WAIT_MS,
      },
    },
    transport,
  })
}

/** Get the RPC URL that will be used (for display/debugging) */
export function getRpcUrl(chain: SupportedChain, rpcUrl?: string): string {
  return resolveRpcUrl(chain, rpcUrl)
}
