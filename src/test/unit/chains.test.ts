/**
 * Blockchain Chains Configuration Test Suite
 * 
 * This test suite validates the chain configuration module which defines supported
 * blockchain networks and provides utilities for chain identification. The module
 * maintains metadata for multiple EVM-compatible chains including Ethereum mainnet,
 * Layer 2 networks, and their corresponding testnets.
 * 
 * Supported chains include:
 * - Ethereum Mainnet (Layer 1)
 * - Arbitrum One (Layer 2)
 * - Optimism (Layer 2)
 * - Polygon (Layer 2)
 * - Base (Layer 2)
 * - Testnets: Sepolia, Arbitrum Sepolia, Optimism Sepolia, Base Sepolia, Polygon Amoy
 */

import { describe, it, expect } from 'vitest'
import { CHAINS, getChainInfo } from '../../rpc/chains.js'

describe('chains', () => {
  /**
   * Chain Configuration Constant Tests
   * 
   * Validates the CHAINS constant which provides a comprehensive registry of
   * supported blockchain networks. Each chain entry includes essential metadata
   * such as chain ID, display name, and block explorer URL.
   * 
   * Test coverage includes:
   * - Chain metadata accuracy (name, ID, explorer URL)
   * - Complete list of supported chains
   * - Testnet classification correctness
   * - Chain ID assignments for all networks
   */
  describe('CHAINS', () => {
    it('should have mainnet with correct properties', () => {
      expect(CHAINS['mainnet']).toEqual({
        name: 'Ethereum Mainnet',
        id: 1,
        explorer: 'https://etherscan.io',
        testnet: false,
      })
    })

    it('should have all expected chains', () => {
      const expectedChains = [
        'mainnet',
        'arbitrum',
        'optimism',
        'polygon',
        'base',
        'sepolia',
        'arbitrumSepolia',
        'optimismSepolia',
        'baseSepolia',
        'polygonAmoy',
      ]
      expect(Object.keys(CHAINS)).toEqual(expectedChains)
    })

    it('should mark testnets correctly', () => {
      expect(CHAINS['sepolia']!.testnet).toBe(true)
      expect(CHAINS['arbitrumSepolia']!.testnet).toBe(true)
      expect(CHAINS['optimismSepolia']!.testnet).toBe(true)
      expect(CHAINS['baseSepolia']!.testnet).toBe(true)
      expect(CHAINS['polygonAmoy']!.testnet).toBe(true)
      expect(CHAINS['mainnet']!.testnet).toBe(false)
    })

    it('should have correct chain IDs', () => {
      expect(CHAINS['mainnet']!.id).toBe(1)
      expect(CHAINS['arbitrum']!.id).toBe(42161)
      expect(CHAINS['optimism']!.id).toBe(10)
      expect(CHAINS['polygon']!.id).toBe(137)
      expect(CHAINS['base']!.id).toBe(8453)
      expect(CHAINS['baseSepolia']!.id).toBe(84532)
      expect(CHAINS['polygonAmoy']!.id).toBe(80002)
    })
  })

  /**
   * Chain Lookup Utility Tests
   * 
   * Validates the getChainInfo function which provides runtime chain identification
   * based on chain ID. This utility enables dynamic chain detection and validation
   * when working with chain-specific RPC endpoints or block data.
   * 
   * Test coverage includes:
   * - Successful chain lookup by standard chain IDs
   * - Undefined response for unsupported chain IDs
   * - Correct metadata retrieval for known chains
   */
  describe('getChainInfo', () => {
    it('should return chain info for valid chain ID', () => {
      const chainInfo = getChainInfo(1)
      expect(chainInfo).toEqual(CHAINS['mainnet'])
    })

    it('should return chain info for arbitrum', () => {
      const chainInfo = getChainInfo(42161)
      expect(chainInfo?.name).toBe('Arbitrum One')
    })

    it('should return undefined for unknown chain ID', () => {
      const chainInfo = getChainInfo(999999)
      expect(chainInfo).toBeUndefined()
    })

    it('should find chain by ID in a chain object', () => {
      const chain = getChainInfo(137)
      expect(chain?.explorer).toBe('https://polygonscan.com')
    })
  })
})
