/**
 * Collision Module
 * 
 * Detects storage slot collisions between contract versions.
 * Critical for preventing state corruption during upgrades.
 */

export { detectCollisions, isUpgradeSafe, type Collision, type CollisionResult } from './detector.js'
export { detectProxyPattern, getReservedSlots, excludeProxySlots, PROXY_SLOTS, type ProxyPattern } from './proxy-handler.js'
export { formatCollisionReport, formatCollisionMarkdownReport, formatCollisionMarkdown, getCollisionExitCode } from './report.js'
