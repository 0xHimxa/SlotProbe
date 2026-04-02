/**
 * Collision - Proxy Handler
 * 
 * Handles proxy pattern detection and special slot considerations.
 * Different proxy patterns use different storage slots.
 */

/** Known proxy pattern storage slots */
export const PROXY_SLOTS = {
  /** EIP-1967 implementation slot */
  EIP1967_IMPL: BigInt('0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'),
  /** EIP-1967 admin slot */
  EIP1967_ADMIN: BigInt('0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'),
  /** Transparent proxy admin */
  LEGACY_ADMIN: BigInt('0x0'),
  /** Visible admin slot (older pattern) */
  ADMIN_SLOT: BigInt('0xa3f0ad74e5423aebfd80d3ef4346578335a9a72e302f5aaeccb84d64e8b14e5'),
}

/** Proxy pattern types */
export type ProxyPattern = 'eip1967' | 'transparent' | 'uups' | 'custom'

/**
 * Detects the proxy pattern used by a contract.
 */
export function detectProxyPattern(address: string, storage: Map<string, string>): ProxyPattern | null {
  const eip1967ImplSlot = '0x' + PROXY_SLOTS.EIP1967_IMPL.toString(16).padStart(64, '0')
  
  if (storage.has(eip1967ImplSlot) && storage.get(eip1967ImplSlot) !== '0x' + '0'.repeat(64)) {
    return 'eip1967'
  }

  const adminSlot = '0x' + PROXY_SLOTS.ADMIN_SLOT.toString(16).padStart(64, '0')
  if (storage.has(adminSlot) && storage.get(adminSlot) !== '0x' + '0'.repeat(64)) {
    return 'transparent'
  }

  return null
}

/**
 * Gets reserved slots for a proxy pattern.
 * These slots should be excluded from collision checks.
 */
export function getReservedSlots(pattern: ProxyPattern): bigint[] {
  switch (pattern) {
    case 'eip1967':
      return [PROXY_SLOTS.EIP1967_IMPL, PROXY_SLOTS.EIP1967_ADMIN]
    case 'transparent':
      return [PROXY_SLOTS.LEGACY_ADMIN]
    case 'uups':
      return [PROXY_SLOTS.EIP1967_IMPL]
    default:
      return []
  }
}

/**
 * Filters out proxy-reserved slots from collision check.
 */
export function excludeProxySlots(
  variables: Array<{ slot: bigint }>,
  pattern: ProxyPattern | null
): Array<{ slot: bigint }> {
  if (!pattern) return variables

  const reserved = new Set(getReservedSlots(pattern).map((s) => s.toString()))
  return variables.filter((v) => !reserved.has(v.slot.toString()))
}
