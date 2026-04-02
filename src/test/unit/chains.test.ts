import { describe, it, expect } from 'vitest'
import { CHAINS, getChainInfo } from '../../rpc/chains.js'

describe('chains', () => {
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
      ]
      expect(Object.keys(CHAINS)).toEqual(expectedChains)
    })

    it('should mark testnets correctly', () => {
      expect(CHAINS['sepolia']!.testnet).toBe(true)
      expect(CHAINS['arbitrumSepolia']!.testnet).toBe(true)
      expect(CHAINS['optimismSepolia']!.testnet).toBe(true)
      expect(CHAINS['mainnet']!.testnet).toBe(false)
    })

    it('should have correct chain IDs', () => {
      expect(CHAINS['mainnet']!.id).toBe(1)
      expect(CHAINS['arbitrum']!.id).toBe(42161)
      expect(CHAINS['optimism']!.id).toBe(10)
      expect(CHAINS['polygon']!.id).toBe(137)
      expect(CHAINS['base']!.id).toBe(8453)
    })
  })

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
