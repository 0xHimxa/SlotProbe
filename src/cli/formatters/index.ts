/**
 * CLI Formatters Module — Central Export
 *
 * Re-exports all CLI formatter functions from a single entry point.
 * Consuming modules import from this barrel file instead of reaching
 * into individual formatter files directly.
 *
 * Provides formatters for three output targets:
 *   - Terminal (coloured stdout via chalk)
 *   - JSON (machine-readable for CI/CD pipelines)
 *   - Markdown (GitHub PR descriptions and issue comments)
 *
 * @module cli/formatters
 */

export { formatDiffTerminal, formatSuccess, formatError, formatWarning, formatInfo } from './terminal.js'
export { formatDiffJson, formatCollisionJson, createResult, createError, type CommandResult } from './json.js'
export { formatDiffMarkdown, formatCollisionMarkdown } from './markdown.js'
