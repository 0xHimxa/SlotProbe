/**
 * Snapshot Module
 * 
 * Captures and manages contract storage snapshots.
 * Snapshots are JSON files that capture contract state at a specific block.
 */

export { captureSnapshot, dryRunCapture, type CaptureOptions, type CaptureResult } from './capture.js'
export { applyOnlyFilter, getVariable, listVariables, groupBySlot } from './filter.js'
export { loadMappingKeys, validateMappingKeys, calculateMappingSlotCount, type MappingKeysFile } from './mapping-keys.js'
export { saveSnapshot, loadSnapshot, validateSnapshotFile } from './store.js'
export { type Snapshot, type SnapshotEntry, type SnapshotMetadata, SnapshotSchema, SnapshotEntrySchema } from './types.js'
