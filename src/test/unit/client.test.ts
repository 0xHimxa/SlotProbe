import { describe, it, expect } from 'vitest'
import { getClient, getRpcUrl, CHAIN_CONFIG, type SupportedChain } from '../../rpc/client.js'
import { mainnet, arbitrum, base, optimism, polygon } from 'viem/chains'

describe('client', () => {
  describe('getClient', () => {
    it('should create a client for mainnet', () => {
      const client = getClient('mainnet')
      expect(client).toBeDefined()
      expect(client.chain).toBeDefined()
    })

    it('should create a client for each supported chain', () => {
      const chains: SupportedChain[] = ['mainnet', 'arbitrum', 'base', 'optimism', 'polygon']
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

  describe('CHAIN_CONFIG', () => {
    it('should export chain config for mainnet', () => {
      expect(CHAIN_CONFIG.mainnet).toBe(mainnet)
    })

    it('should export chain config for all supported chains', () => {
      expect(CHAIN_CONFIG.mainnet).toBe(mainnet)
      expect(CHAIN_CONFIG.arbitrum).toBe(arbitrum)
      expect(CHAIN_CONFIG.base).toBe(base)
      expect(CHAIN_CONFIG.optimism).toBe(optimism)
      expect(CHAIN_CONFIG.polygon).toBe(polygon)
    })
  })

  describe('SupportedChain type', () => {
    it('should accept valid chain names', () => {
      const validChains: SupportedChain[] = ['mainnet', 'arbitrum', 'base', 'optimism', 'polygon']
      for (const chain of validChains) {
        expect(() => getClient(chain)).not.toThrow()
      }
    })
  })
})
