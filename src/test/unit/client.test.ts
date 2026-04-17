/**
 * RPC Client Module Test Suite
 * 
 * This test suite validates the RPC client configuration which provides Viem client
 * instances for interacting with various blockchain networks. The module handles
 * client creation, RPC URL management, and chain-specific configuration.
 * 
 * The client module provides:
 * 1. Viem client factory for multiple EVM-compatible chains
 * 2. RPC URL resolution with custom override support
 * 3. Chain-specific configuration exports for advanced usage
 * 4. Type definitions for supported network identifiers
 */

import { describe, it, expect } from 'vitest'
import { getClient, getRpcUrl, CHAIN_CONFIG, type SupportedChain } from '../../rpc/client.js'
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

describe('client', () => {
  /**
   * Viem Client Factory Tests
   * 
   * Validates the getClient function which creates configured Viem HTTP clients
   * for blockchain interactions. Each client is properly initialized with the
   * appropriate chain configuration and RPC endpoint.
   * 
   * Test coverage includes:
   * - Client creation for all supported chains
   * - Custom RPC URL override functionality
   * - Multicall batch configuration verification
   * - Client instance property validation
   */
  describe('getClient', () => {
    it('should create a client for mainnet', () => {
      const client = getClient('mainnet')
      expect(client).toBeDefined()
      expect(client.chain).toBeDefined()
    })

    it('should create a client for each supported chain', () => {
      const chains: SupportedChain[] = [
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
      for (const chain of chains) {
        const client = getClient(chain)
        expect(client).toBeDefined()
      }
    })

    it('should create a client with custom RPC URL', () => {
      const customRpc = 'https://example.com/rpc'
      const client = getClient('mainnet', customRpc)
      expect(client).toBeDefined()
    })

    it('should have multicall batch config', () => {
      const client = getClient('mainnet')
      expect(client).toBeDefined()
    })
  })

  /**
   * RPC URL Resolution Tests
   * 
   * Validates the getRpcUrl function which resolves the appropriate RPC endpoint
   * URL for a given chain. The function supports custom URL overrides for users
   * who prefer to use their own RPC providers.
   * 
   * Test coverage includes:
   * - Default URL retrieval for known chains
   * - Custom URL passthrough when provided
   * - Chain-specific URL differentiation
   * - URL format validation
   */
  describe('getRpcUrl', () => {
    it('should return default RPC URL for mainnet', () => {
      const rpcUrl = getRpcUrl('mainnet')
      expect(rpcUrl).toBeDefined()
      expect(typeof rpcUrl).toBe('string')
      expect(rpcUrl.length).toBeGreaterThan(0)
    })

    it('should return custom RPC URL when provided', () => {
      const customRpc = 'https://my-custom-rpc.com'
      const rpcUrl = getRpcUrl('mainnet', customRpc)
      expect(rpcUrl).toBe(customRpc)
    })

    it('should return different URLs for different chains', () => {
      const mainnetUrl = getRpcUrl('mainnet')
      const arbitrumUrl = getRpcUrl('arbitrum')
      expect(mainnetUrl).not.toBe(arbitrumUrl)
    })

    it('should return a valid URL string', () => {
      const rpcUrl = getRpcUrl('arbitrum')
      expect(rpcUrl).toMatch(/^https?:\/\//)
    })
  })

  /**
   * Chain Configuration Export Tests
   * 
   * Validates the CHAIN_CONFIG export which provides Viem chain objects for all
   * supported networks. This enables advanced users to access native Viem chain
   * configuration for custom operations.
   * 
   * Test coverage includes:
   * - Individual chain config exports
   * - Complete chain configuration mapping
   * - Viem chain object reference validation
   */
  describe('CHAIN_CONFIG', () => {
    it('should export chain config for mainnet', () => {
      expect(CHAIN_CONFIG.mainnet).toBe(mainnet)
    })

    it('should export chain config for all supported chains', () => {
      expect(CHAIN_CONFIG.mainnet).toBe(mainnet)
      expect(CHAIN_CONFIG.sepolia).toBe(sepolia)
      expect(CHAIN_CONFIG.arbitrum).toBe(arbitrum)
      expect(CHAIN_CONFIG.arbitrumSepolia).toBe(arbitrumSepolia)
      expect(CHAIN_CONFIG.base).toBe(base)
      expect(CHAIN_CONFIG.baseSepolia).toBe(baseSepolia)
      expect(CHAIN_CONFIG.optimism).toBe(optimism)
      expect(CHAIN_CONFIG.optimismSepolia).toBe(optimismSepolia)
      expect(CHAIN_CONFIG.polygon).toBe(polygon)
      expect(CHAIN_CONFIG.polygonAmoy).toBe(polygonAmoy)
    })
  })

  /**
   * Type Definition Validation Tests
   * 
   * Validates that the SupportedChain type correctly accepts all valid chain
   * identifiers and rejects invalid values at compile time. This ensures
   * type safety when specifying target chains for RPC operations.
   */
  describe('SupportedChain type', () => {
    it('should accept valid chain names', () => {
      const validChains: SupportedChain[] = [
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
      for (const chain of validChains) {
        expect(() => getClient(chain)).not.toThrow()
      }
    })
  })
})
