/**
 * Chain Configuration
 * 
 * Defines supported EVM chains and their properties.
 * Add custom chains or L2s here as needed.
 */

export interface ChainInfo {
  /** Human-readable chain name */
  name: string
  /** Chain ID (e.g., 1 for mainnet) */
  id: number
  /** Block explorer URL for links */
  explorer: string
  /** Whether this is a testnet */
  testnet: boolean
}

/** Supported chains metadata */
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

/** Get chain info by chain ID */
export function getChainInfo(chainId: number): ChainInfo | undefined {
  return Object.values(CHAINS).find(c => c.id === chainId)
}
