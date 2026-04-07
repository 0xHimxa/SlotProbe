/**
 * Chain Configuration — Supported Networks
 *
 * Defines metadata for all EVM chains supported by SlotProbe. This
 * module provides human-readable names, chain IDs, block explorer
 * URLs, and testnet flags for each network.
 *
 * The chain metadata is used by the CLI for display purposes (e.g.
 * linking to explorer pages in markdown reports) and by the config
 * loader to resolve chain-specific RPC URLs.
 *
 * To add a new chain, add an entry to the `CHAINS` record. The
 * viem-level transport configuration lives in `client.ts`.
 *
 * @module rpc/chains
 */

/**
 * Metadata descriptor for a supported EVM chain.
 *
 * Provides the information needed to display chain context in CLI
 * output and to generate explorer links for contract addresses.
 */
export interface ChainInfo {
  /** Human-readable chain name (e.g. "Ethereum Mainnet", "Arbitrum One") */
  name: string
  /** EIP-155 chain ID (e.g. 1 for mainnet, 42161 for Arbitrum) */
  id: number
  /** Base URL for the chain's block explorer (no trailing slash) */
  explorer: string
  /** Whether this is a testnet — affects default RPC selection and display */
  testnet: boolean
}

/**
 * Registry of all supported chains with their metadata.
 *
 * Includes both mainnets (Ethereum, Arbitrum, Optimism, Polygon, Base)
 * and their Sepolia testnet counterparts. The record keys match the
 * chain name strings used in CLI flags and config files.
 */
export const CHAINS: Record<string, ChainInfo> = {
  mainnet: {
    name: 'Ethereum Mainnet',
    id: 1,
    explorer: 'https://etherscan.io',
    testnet: false,
  },
  arbitrum: {
    name: 'Arbitrum One',
    id: 42161,
    explorer: 'https://arbiscan.io',
    testnet: false,
  },
  optimism: {
    name: 'Optimism',
    id: 10,
    explorer: 'https://optimistic.etherscan.io',
    testnet: false,
  },
  polygon: {
    name: 'Polygon',
    id: 137,
    explorer: 'https://polygonscan.com',
    testnet: false,
  },
  base: {
    name: 'Base',
    id: 8453,
    explorer: 'https://basescan.org',
    testnet: false,
  },
  sepolia: {
    name: 'Sepolia Testnet',
    id: 11155111,
    explorer: 'https://sepolia.etherscan.io',
    testnet: true,
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    id: 421614,
    explorer: 'https://sepolia.arbiscan.io',
    testnet: true,
  },
  optimismSepolia: {
    name: 'Optimism Sepolia',
    id: 11155420,
    explorer: 'https://sepolia-optimism.etherscan.io',
    testnet: true,
  },
}

/**
 * Looks up chain metadata by EIP-155 chain ID.
 *
 * Searches the `CHAINS` registry for an entry matching the given numeric
 * ID. Returns `undefined` if no supported chain has that ID, allowing
 * callers to handle unknown chains gracefully.
 *
 * @param chainId - The EIP-155 chain ID to look up (e.g. 1, 42161, 10)
 * @returns The matching {@link ChainInfo} object, or `undefined` if the
 *          chain ID is not in the supported registry
 *
 * @example
 *   getChainInfo(1)     // { name: 'Ethereum Mainnet', id: 1, ... }
 *   getChainInfo(42161) // { name: 'Arbitrum One', id: 42161, ... }
 *   getChainInfo(999)   // undefined
 */
export function getChainInfo(chainId: number): ChainInfo | undefined {
  return Object.values(CHAINS).find(c => c.id === chainId)
}
