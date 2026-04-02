/**
 * RPC Client Factory
 * 
 * Creates viem public clients for different EVM chains.
 * Used by the storage engine to read contract storage via eth_getStorageAt.
 * Supports mainnet, arbitrum, base, optimism, and polygon out of the box.
 */

import { createPublicClient, http, type PublicClient, type Chain } from 'viem'
import { mainnet, arbitrum, base, optimism, polygon } from 'viem/chains'

/** Supported chains for snapshot operations */
const CHAINS = { mainnet, arbitrum, base, optimism, polygon } as const
export type SupportedChain = keyof typeof CHAINS

/** Chain configuration map - add custom chains here */
export const CHAIN_CONFIG: Record<SupportedChain, Chain> = CHAINS

/**
 * Creates a viem public client for the specified chain.
 * Falls back to the chain's default public RPC if no custom RPC URL provided.
 */
export function getClient(chain: SupportedChain, rpcUrl?: string): PublicClient {
  const chainConfig = CHAINS[chain]
  const transport = http(rpcUrl ?? chainConfig.rpcUrls.default.http[0])
  
  return createPublicClient({
    chain: chainConfig,
    transport,
  })
}

/** Get the RPC URL that will be used (for display/debugging) */
export function getRpcUrl(chain: SupportedChain, rpcUrl?: string): string {
  return rpcUrl ?? CHAINS[chain].rpcUrls.default.http[0]
}
