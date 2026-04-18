# Changelog

All notable changes to SlotProbe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-04-18

### Initial Release

First public release of SlotProbe.

#### Added

**Storage Engine**
- `eth_getStorageAt` slot reader with request deduplication and RPC batching
- keccak256 slot derivation for mappings, dynamic arrays, nested mappings, and structs
- Full Solidity type decoder: `bool`, `uint/int` (all widths 8–256), `address`, fixed `bytes1`–`bytes32`, dynamic `bytes` and `string` (short inline form and long out-of-line form)
- Packed slot extractor — correctly handles multiple variables sharing a single 32-byte slot

**Artifact Parser**
- Foundry (`forge build`) artifact parser
- Hardhat artifact parser
- Auto-detection of artifact format (no config needed)
- `validateArtifact` for early error reporting before capture begins

**Snapshot Capture**
- Recursive capture pipeline supporting: scalars, structs, fixed-length arrays, dynamic arrays, and mappings (with user-supplied keys)
- `--only` flag for targeted capture of specific variables
- `--dry-run` mode that estimates slot count without making any RPC calls
- Mapping key files (JSON) for specifying which mapping entries to probe
- Bigint-safe JSON serialization/deserialization for snapshot files

**Diff Engine**
- Variable-name-level semantic diff between two snapshots
- Changed, added, removed, and unchanged status tracking
- Terminal (coloured), JSON, and Markdown output formatters

**Collision Detector**
- Byte-range overlap detection between two storage layouts
- Comparison region tracking to prevent mapping internals from false-positiving against root slots
- EIP-1967, Transparent Proxy, and UUPS reserved slot awareness

**Migration Generator**
- Handlebars-based migration script generation
- Foundry (`forge script`) output template
- Hardhat output template
- `--verify` flag: spawns an Anvil fork, runs the script, re-captures state, and diffs against expected snapshot

**CLI**
- `slotprobe snapshot <address>` — full capture command
- `slotprobe diff <before> <after>` — snapshot comparison
- `slotprobe check-collision <old> <new>` — storage layout collision check
- `slotprobe generate-migration <before> <after>` — migration script generation
- `slotprobe init` — generate a starter config file
- Exit code `1` on collision or verification failure (CI-friendly)
- `--output terminal|json|markdown` global flag

**RPC Layer**
- Per-chain `viem` public client factory
- Exponential backoff retry with `p-retry` (handles 429, 5xx, timeouts)
- Concurrency limiter with `p-limit`
- Multi-chain support: mainnet, Arbitrum, Base, Optimism, Polygon

**Config**
- Auto-discovered config from `.SlotProberc.json`, `.slotprobe.json`, or `slotprobe.config.json`
- In-process cache — filesystem is read at most once per process
- Full Zod schema validation with descriptive errors

**Testing**
- 11 unit test files covering all core modules
- 4 integration test files
- Vitest configuration with coverage via `@vitest/coverage-v8`

**Tooling**
- ESM-only TypeScript package (Node ≥ 20)
- `tsup` build with `.d.ts` declaration files
- Example GitHub Actions workflow for CI storage collision checking

[1.0.0]: https://github.com/0xHimxa/SlotProbe/releases/tag/v1.0.0
