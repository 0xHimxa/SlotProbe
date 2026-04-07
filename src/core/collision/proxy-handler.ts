/**
 * Collision — Proxy Pattern Handler
 *
 * Manages proxy-pattern-aware collision logic by identifying which storage
 * slots are reserved by common proxy implementations (EIP-1967, Transparent,
 * UUPS) and excluding them from collision checks. These reserved slots use
 * pseudo-random positions derived from keccak256 hashes to avoid accidental
 * overlap with user-defined storage.
 *
 * @module core/collision/proxy-handler
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
 * Detects the proxy pattern used by a contract by inspecting known
 * proxy-reserved storage slots.
 *
 * @param address - Contract address (for future Etherscan lookup)
 * @param storage - Map of slot hex → value hex from on-chain reads
 * @returns Detected proxy pattern or null if not a proxy
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
 * Returns the set of storage slots reserved by the given proxy pattern.
 * These slots store implementation addresses and admin addresses and
 * should be excluded from collision checks.
 *
 * @param pattern - Detected proxy pattern
 * @returns Array of reserved slot positions as bigint
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
 * Filters out proxy-reserved slots from a variable list before
 * running collision detection. This prevents false positives from
 * EIP-1967 implementation/admin slots.
 *
 * @param variables - Array of storage variable descriptors
 * @param pattern   - Detected proxy pattern (or null if not a proxy)
 * @returns Filtered array with reserved slots removed
 */
export function excludeProxySlots(
  variables: Array<{ slot: bigint }>,
  pattern: ProxyPattern | null
): Array<{ slot: bigint }> {
  if (!pattern) return variables

  const reserved = new Set(getReservedSlots(pattern).map((s) => s.toString()))
  return variables.filter((v) => !reserved.has(v.slot.toString()))
}
