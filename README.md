# 🔬 SlotProbe

> **The missing developer tool for Web3** — snapshot, diff, and safely migrate smart contract storage across upgrades. No more manual slot hunting. No more blind upgrades.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Built for EVM](https://img.shields.io/badge/Built%20for-EVM-purple)](https://ethereum.org)

---

## 📖 Table of Contents

- [What is SlotProbe?](#-what-is-slotprobe)
- [Quick Start](#-quick-start)
- [Architecture Overview](#-architecture-overview)
- [Contributor Guide — Where to Start](#-contributor-guide--where-to-start)
  - [Layer 1: Foundation](#layer-1-foundation--start-here)
  - [Layer 2: The Brain](#layer-2-the-brain)
  - [Layer 3: Downstream Consumers](#layer-3-downstream-consumers)
  - [Layer 4: CLI & Output](#layer-4-cli--output)
- [File-by-File Reference](#-file-by-file-reference)
- [How to Learn Each Module](#-how-to-learn-each-module)
- [Testing](#-testing)
- [Configuration](#-configuration)
- [Tech Stack](#-tech-stack)
- [Project Status](#-project-status)
- [Contributing](#-contributing)

---

## 🔥 What is SlotProbe?

Every serious smart contract protocol eventually faces these problems:

1. **Upgrading a proxy contract** — did the new implementation accidentally overwrite `_owner` at slot 3?
2. **Post-upgrade auditing** — did all the old state survive? Are there stale mappings?
3. **Blind migration scripts** — you wrote a migration, ran it, and *hoped* it worked.

SlotProbe solves all three by providing a complete workflow in a single CLI tool:

```
snapshot → semantic diff → storage collision check → migration script → auto-verification on fork
```

It reads raw EVM storage slots via `eth_getStorageAt`, maps them back to **named Solidity variables** using the compiler's `storageLayout` output, and lets you diff, compare, and migrate at the variable-name level — not the raw hex level.

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/0xHimxa/SlotProbe.git
cd SlotProbe

# Install dependencies
npm install

# Run the test suite to verify everything works
npx vitest run

# Run the CLI in development mode
npx tsx src/cli/index.ts --help
```

### Configure Your RPC (Optional)

Copy the example config and add your RPC keys:

```bash
cp .SlotProberc.example.json .SlotProberc.json
```

```json
{
  "rpc": {
    "maxConcurrent": 50,
    "retries": 3,
    "backoffMs": 1000
  },
  "chains": {
    "mainnet": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"
  }
}
```

> **Note:** SlotProbe works without config — it falls back to public RPCs. But public RPCs have aggressive rate limits, so a private RPC URL is recommended for real usage.

---

## 🏗 Architecture Overview

SlotProbe is built in **six layers**, each depending only on the layers below it:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Layer (cli/)                         │
│   snapshot | diff | check-collision | generate-migration     │
│         --dry-run | --only | --output | --verify             │
└────────────────────────────┬────────────────────────────────┘
                             │
          ┌──────────────────┼───────────────────┐
          ▼                  ▼                   ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐
│  Snapshot System │ │ Diff Engine  │ │ Collision / Migration │
│  (core/snapshot) │ │ (core/diff)  │ │ (core/collision,      │
│                  │ │              │ │  core/migration)      │
└────────┬─────────┘ └──────┬───────┘ └──────────┬───────────┘
         │                  │                    │
         └──────────────────▼────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
   ┌────────────────┐ ┌──────────┐ ┌───────────────┐
   │ Storage Engine │ │ Artifact │ │  RPC + Config  │
   │ (slot math,    │ │ Parser   │ │  (viem client, │
   │  decoder,      │ │ (Foundry │ │   batch,       │
   │  packed slots) │ │  Hardhat)│ │   retry)       │
   └────────────────┘ └──────────┘ └───────────────┘
```

The key insight: **everything flows through the snapshot capture pipeline** (`capture.ts`). Understanding that file means you understand how SlotProbe works at its core.

---

## 🧭 Contributor Guide — Where to Start

Welcome! This section is designed to take you from "I just cloned the repo" to "I understand the whole system" in a structured way. Don't skip steps — each layer builds on the previous one.

### Prerequisites You'll Need

Before diving into the code, make sure you're comfortable with:

- **TypeScript** (generics, async/await, `bigint` arithmetic)
- **EVM Storage Layout** — [read this first](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- **keccak256 slot derivation** for mappings and dynamic arrays (the Solidity docs above cover this)
- **Foundry basics** — specifically `forge build` output and `anvil` for local EVM forks

> **💡 Tip:** If EVM storage layout is new to you, build a mental model first. Open a verified contract on Etherscan, manually calculate the slot for a mapping entry using keccak256, and verify with `cast storage`. This exercise is worth more than reading 10 articles.

---

### Layer 1: Foundation — Start Here

These modules have **zero dependencies on other SlotProbe code** (they only use external libraries like `viem` and `zod`). Start here because everything else builds on them.

#### 📁 Read Order

| # | File | What It Does | Time |
|---|------|-------------|------|
| 1 | [`src/config/schema.ts`](src/config/schema.ts) | Defines the Zod schema for `.SlotProberc.json`. Gives you the shape of all runtime config. | 5 min |
| 2 | [`src/config/loader.ts`](src/config/loader.ts) | Discovers and loads config files from disk. Has an in-process cache so repeated calls don't hit the filesystem. | 10 min |
| 3 | [`src/rpc/client.ts`](src/rpc/client.ts) | Creates `viem` public clients per chain. This is how SlotProbe talks to the blockchain. | 5 min |
| 4 | [`src/rpc/retry.ts`](src/rpc/retry.ts) | Wraps RPC calls with exponential backoff using `p-retry`. Understands which HTTP errors are retryable (429, 5xx, timeouts). | 5 min |
| 5 | [`src/rpc/batch.ts`](src/rpc/batch.ts) | Concurrency limiter using `p-limit`. Prevents flooding the RPC provider with too many parallel requests. | 5 min |
| 6 | [`src/rpc/chains.ts`](src/rpc/chains.ts) | Chain metadata (names, IDs, explorer URLs). Used by the CLI display layer. | 3 min |

#### ✅ Exercise: Plug In Real Values

After reading these files, try this in a scratch script:

```typescript
// scratch.ts — run with: npx tsx scratch.ts
import { getClient } from './src/rpc/client.js'

const client = getClient('mainnet')
const slot0 = await client.getStorageAt({
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  slot: '0x0000000000000000000000000000000000000000000000000000000000000000',
})
console.log('USDC slot 0:', slot0)
```

> **🎯 What you should learn:** A viem client calling `eth_getStorageAt` returns a 66-char hex string (`0x` + 64 hex digits) representing 32 raw bytes. Everything in SlotProbe starts from this primitive.

---

### Layer 2: The Brain

These modules implement the core EVM storage logic — slot math, type decoding, artifact parsing. **This is where the real complexity lives.**

#### 📁 Read Order

| # | File | What It Does | Time |
|---|------|-------------|------|
| 7 | [`src/core/storage-engine/slot-calculator.ts`](src/core/storage-engine/slot-calculator.ts) | **The hardest file in the codebase.** Implements keccak256 slot derivation for mappings, dynamic arrays, nested mappings, and structs. Also handles encoding/decoding of mapping keys (address, uint, bool, string, bytes). | 30 min |
| 8 | [`src/core/storage-engine/decoder.ts`](src/core/storage-engine/decoder.ts) | Converts raw hex to typed Solidity values — bool, uint/int (all widths), address, fixed bytes, dynamic bytes/string (short form). Handles compiler internal type IDs like `t_uint256` → `uint256`. | 15 min |
| 9 | [`src/core/storage-engine/packed.ts`](src/core/storage-engine/packed.ts) | Solidity packs multiple small variables into one 32-byte slot. This module extracts individual values by byte offset and size. Variables pack from the right (low bytes). | 10 min |
| 10 | [`src/core/storage-engine/reader.ts`](src/core/storage-engine/reader.ts) | High-level wrapper over `eth_getStorageAt` with retry and batch support. `readSlot` for one, `readSlots` for many with deduplication. | 10 min |
| 11 | [`src/core/artifact-parser/types.ts`](src/core/artifact-parser/types.ts) | The unified `StorageLayout` schema. Every downstream module works with this shape. Includes `StorageVariable`, `TypeInfo`, and raw Foundry interfaces. | 10 min |
| 12 | [`src/core/artifact-parser/foundry.ts`](src/core/artifact-parser/foundry.ts) | Parses Foundry `forge build` JSON artifacts. Normalises string slots → bigint, string byte counts → number. | 10 min |
| 13 | [`src/core/artifact-parser/hardhat.ts`](src/core/artifact-parser/hardhat.ts) | Same as Foundry parser but for Hardhat artifact format. Nearly identical normalisation logic. | 5 min |
| 14 | [`src/core/artifact-parser/normalizer.ts`](src/core/artifact-parser/normalizer.ts) | Auto-detects Foundry vs Hardhat from JSON structure and delegates to the right parser. Also provides `validateArtifact` for early error reporting. | 5 min |

#### ✅ Exercise: Trace a Slot Calculation

Open `slot-calculator.ts` and trace a mapping slot calculation with concrete values:

```typescript
import { mappingSlot } from './src/core/storage-engine/slot-calculator.js'

// For mapping(address => uint256) at slot 5
// User address: 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
const slot = mappingSlot(
  '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  5n
)
console.log('Derived slot:', slot.toString(16))
// Now verify with: cast storage <contract> <derived-slot-hex>
```

#### ✅ Exercise: Decode a Raw Value

```typescript
import { decodeValue } from './src/core/storage-engine/decoder.js'

// Decode a uint256 (100 in decimal = 0x64 in hex)
console.log(decodeValue('0x' + '0'.repeat(62) + '64', 't_uint256'))
// → '100'

// Decode a bool (true)
console.log(decodeValue('0x' + '0'.repeat(63) + '1', 't_bool'))
// → true

// Decode an address
console.log(decodeValue('0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045', 't_address'))
// → '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
```

#### ✅ Exercise: Parse a Real Artifact

```typescript
import { parseArtifact } from './src/core/artifact-parser/normalizer.js'

// Point at any Foundry build artifact (run `forge build` first)
const layout = parseArtifact('./out/MyContract.sol/MyContract.json')
console.log('Contract:', layout.contractName)
console.log('Variables:', layout.variables.map(v => `${v.name} (${v.label}) @ slot ${v.slot}`))
console.log('Types:', Object.keys(layout.types))
```

> **🎯 What you should learn:** The artifact parser transforms raw compiler JSON into a normalised `StorageLayout` with typed `bigint` slots and `number` byte counts. Every module downstream works with this exact shape.

---

### Layer 3: Downstream Consumers

These modules **consume** the storage engine and artifact parser to do useful things. Start with `capture.ts` — it's the heart of SlotProbe.

#### 📁 Read Order

| # | File | What It Does | Time |
|---|------|-------------|------|
| 15 | [`src/core/snapshot/types.ts`](src/core/snapshot/types.ts) | Defines the `Snapshot` and `SnapshotEntry` Zod schemas. A snapshot is named variables with decoded values at a specific block. | 5 min |
| 16 | [`src/core/snapshot/filter.ts`](src/core/snapshot/filter.ts) | Implements the `--only` flag — filter a storage layout to specific variable names. Also provides `groupBySlot` for packed-slot analysis. | 5 min |
| 17 | [`src/core/snapshot/mapping-keys.ts`](src/core/snapshot/mapping-keys.ts) | Loads user-supplied mapping key files (JSON). Mappings can't be enumerated on-chain, so users provide the keys they care about. | 5 min |
| 18 | [`src/core/snapshot/store.ts`](src/core/snapshot/store.ts) | Serialises/deserialises snapshots to JSON with bigint-safe encoding (`__bigint__` marker pattern). | 5 min |
| 19 | [`src/core/snapshot/storage-decode.ts`](src/core/snapshot/storage-decode.ts) | Handles Solidity's two-phase bytes/string storage — short (inline, ≤31 bytes) vs long (out-of-line at `keccak256(slot)`). | 10 min |
| 20 | [`src/core/snapshot/capture-helpers.ts`](src/core/snapshot/capture-helpers.ts) | Pure utility functions extracted from capture.ts — mapping slot calculation, packed-value detection, fixed-array detection, type lookups. | 10 min |
| 21 | **[`src/core/snapshot/capture.ts`](src/core/snapshot/capture.ts)** | **⭐ THE HEART OF SLOTPROBE ⭐** — The full capture pipeline. 1370 lines of orchestration. Read the §1–§7 section headers to navigate. See the deep-dive section below. | 45 min |
| 22 | [`src/core/diff/types.ts`](src/core/diff/types.ts) | `DiffEntry`, `DiffResult`, `DiffStatus` — the diff output shape. | 3 min |
| 23 | [`src/core/diff/engine.ts`](src/core/diff/engine.ts) | Compares two snapshots by variable name. Produces changed/added/removed/unchanged entries. | 10 min |
| 24 | [`src/core/diff/semantic.ts`](src/core/diff/semantic.ts) | Formatting helpers — summary strings, change overviews, entry formatting. | 5 min |
| 25 | [`src/core/collision/proxy-handler.ts`](src/core/collision/proxy-handler.ts) | Knows about EIP-1967/Transparent/UUPS proxy reserved slots. Filters them from collision checks. | 5 min |
| 26 | [`src/core/collision/detector.ts`](src/core/collision/detector.ts) | Flattens both storage layouts into byte-addressable fields, then checks for byte-range overlap. Tracks comparison "regions" so mapping internals don't false-positive against root slots. | 20 min |
| 27 | [`src/core/collision/report.ts`](src/core/collision/report.ts) | Formats collision results for terminal and Markdown output. | 5 min |
| 28 | [`src/core/migration/generator.ts`](src/core/migration/generator.ts) | Generates Foundry/Hardhat migration scripts from diff entries using Handlebars templates. | 10 min |
| 29 | [`src/core/migration/verifier.ts`](src/core/migration/verifier.ts) | The `--verify` flow: spawns Anvil, runs the migration, re-captures state, and diffs against the expected snapshot. | 15 min |

#### 🔍 Deep Dive: `capture.ts` (The Heart of SlotProbe)

This is the most important file. It's organized into 7 numbered sections — read them in order:

| Section | What It Does |
|---------|-------------|
| **§1 — Public Interfaces** | `CaptureOptions` and `CaptureResult` — the inputs/outputs of the pipeline |
| **§2 — Public Entry Points** | `captureSnapshot()` (full capture) and `dryRunCapture()` (estimation only) |
| **§3 — Internal Context Types** | `CaptureContext` and `CaptureVariableInput` — the "work item" that flows through every recursive call |
| **§4 — Recursive Dispatch** | `captureVariableEntries()` — the central dispatcher that routes each variable to its handler: leaf, struct, dynamic array, fixed array, or mapping |
| **§5 — Slot I/O Layer** | `getSlotValue/getSlotValues/flushQueuedSlots` — cache dedup + batch queue so the same slot is never read twice |
| **§6 — Helper Utilities** | Placeholder entries for unexpandable mappings |
| **§7 — Dry-Run Engine** | Mirrors the dispatch logic but only counts slots instead of reading them |

**The recursion model** is the key concept:

```
captureSnapshot()
  → captureVariableEntries(topLevelVar)      ← dispatch
    → captureStructEntries(struct)            ← struct members
      → captureVariableEntries(member)        ← recurse
        → captureLeafEntry(scalar)            ← terminal case
    → captureDynamicArrayEntries(array)
      → captureVariableEntries(element)       ← recurse per element
    → captureMappingEntries(mapping)
      → captureVariableEntries(value)         ← recurse per key
```

Each recursive call carries a `CaptureVariableInput` with the current **path** (`"config.fee"`, `"balances[0xdead...]"`), **base slot**, and **sibling variables** (for packed-slot detection).

#### ✅ Exercise: Write a Test to Verify Understanding

The best way to confirm you understand capture.ts is to write a test:

```typescript
// Create a test with a simple storage layout JSON (see test.json in the repo)
// Call captureSnapshot() pointed at a local Anvil fork
// Verify the snapshot entries have the expected variable names, paths, and decoded values
```

Look at `src/test/unit/capture.test.ts` for examples of how existing tests mock the RPC layer and verify the recursive expansion.

---

### Layer 4: CLI & Output

The final layer wires everything into a polished command-line experience.

#### 📁 Read Order

| # | File | What It Does | Time |
|---|------|-------------|------|
| 30 | [`src/cli/index.ts`](src/cli/index.ts) | Entry point. Creates the Commander program and registers all 4 subcommands. | 3 min |
| 31 | [`src/cli/commands/snapshot.ts`](src/cli/commands/snapshot.ts) | `slotprobe snapshot <address>` — wires CLI flags to `captureSnapshot()` | 10 min |
| 32 | [`src/cli/commands/diff.ts`](src/cli/commands/diff.ts) | `slotprobe diff <before> <after>` — loads two snapshots and runs `diffSnapshots()` | 10 min |
| 33 | [`src/cli/commands/check-collision.ts`](src/cli/commands/check-collision.ts) | `slotprobe check-collision <old> <new>` — parses two artifacts and runs `detectCollisions()` | 10 min |
| 34 | [`src/cli/commands/generate-migration.ts`](src/cli/commands/generate-migration.ts) | `slotprobe generate-migration <before> <after>` — generates and optionally verifies migration scripts | 10 min |
| 35 | [`src/cli/formatters/terminal.ts`](src/cli/formatters/terminal.ts) | Chalk-colored diff output for the terminal | 5 min |
| 36 | [`src/cli/formatters/markdown.ts`](src/cli/formatters/markdown.ts) | Markdown table output for GitHub PRs | 5 min |
| 37 | [`src/cli/formatters/json.ts`](src/cli/formatters/json.ts) | JSON output for CI/scripting | 5 min |

---

## 📋 File-by-File Reference

A complete map of every file in the codebase, grouped by module:

### Config (`src/config/`)

| File | Purpose | Lines |
|------|---------|-------|
| `schema.ts` | Zod schema for `.SlotProberc.json`, default values | 83 |
| `loader.ts` | Config discovery, loading, caching, merging | 180 |
| `index.ts` | Barrel re-export | 4 |

### RPC (`src/rpc/`)

| File | Purpose | Lines |
|------|---------|-------|
| `client.ts` | Viem public client factory with multicall batching | 63 |
| `retry.ts` | `withRetry()` — exponential backoff with `p-retry` | 94 |
| `batch.ts` | `createBatcher()` — concurrency limiter with `p-limit` | 74 |
| `chains.ts` | Chain metadata (names, IDs, explorer URLs) | 112 |
| `index.ts` | Barrel re-export | 10 |

### Storage Engine (`src/core/storage-engine/`)

| File | Purpose | Lines |
|------|---------|-------|
| `slot-calculator.ts` | keccak256 slot math for mappings, arrays, structs, nested mappings. Mapping key encode/decode. | 543 |
| `decoder.ts` | Raw hex → typed Solidity value (uint, int, bool, address, bytes, string) | 337 |
| `packed.ts` | Extract individual values from packed 32-byte slots | 191 |
| `reader.ts` | `readSlot()` / `readSlots()` — RPC wrappers with dedup and retry | 130 |
| `index.ts` | Barrel re-export | 34 |

### Artifact Parser (`src/core/artifact-parser/`)

| File | Purpose | Lines |
|------|---------|-------|
| `types.ts` | `StorageLayout`, `StorageVariable`, `TypeInfo` Zod schemas + Foundry raw interfaces | 148 |
| `foundry.ts` | Parse Foundry `forge build` artifacts → `StorageLayout` | 170 |
| `hardhat.ts` | Parse Hardhat artifacts → `StorageLayout` | 156 |
| `normalizer.ts` | Auto-detect format + `parseArtifact()` entry point + `validateArtifact()` | 154 |
| `index.ts` | Barrel re-export | 10 |

### Snapshot (`src/core/snapshot/`)

| File | Purpose | Lines |
|------|---------|-------|
| **`capture.ts`** | **⭐ Core capture pipeline — recursive dispatch, I/O batching, dry-run estimation** | **1370** |
| `capture-helpers.ts` | Pure helpers: mapping slot calc, type lookups, packed detection, fixed-array detection | 299 |
| `storage-decode.ts` | Dynamic bytes/string short-form + long-form decoding | 116 |
| `filter.ts` | `--only` flag implementation + `groupBySlot` | 132 |
| `store.ts` | Save/load snapshots with bigint-safe JSON serialization | 122 |
| `mapping-keys.ts` | Load + validate user-supplied mapping key files | 138 |
| `types.ts` | `Snapshot`, `SnapshotEntry` Zod schemas | 109 |
| `index.ts` | Barrel re-export | 14 |

### Diff (`src/core/diff/`)

| File | Purpose | Lines |
|------|---------|-------|
| `engine.ts` | `diffSnapshots()` — semantic variable-name-level comparison | 148 |
| `semantic.ts` | Summary formatting, change overviews, entry formatting | 96 |
| `types.ts` | `DiffEntry`, `DiffResult`, `DiffStatus` | 96 |
| `index.ts` | Barrel re-export | 9 |

### Collision (`src/core/collision/`)

| File | Purpose | Lines |
|------|---------|-------|
| `detector.ts` | Flatten + compare storage layouts for byte-range overlap | 548 |
| `proxy-handler.ts` | EIP-1967/Transparent/UUPS reserved slot handling | 90 |
| `report.ts` | Terminal + Markdown collision report formatting | 101 |
| `index.ts` | Barrel re-export | 10 |

### Migration (`src/core/migration/`)

| File | Purpose | Lines |
|------|---------|-------|
| `generator.ts` | Handlebars-based migration script generation (Foundry + Hardhat) | 145 |
| `verifier.ts` | Anvil fork verification: spawn → run script → diff → pass/fail | 355 |
| `templates/` | `.hbs` template files for Foundry and Hardhat scripts | — |
| `index.ts` | Barrel re-export | 5 |

### CLI (`src/cli/`)

| File | Purpose | Lines |
|------|---------|-------|
| `index.ts` | Commander program setup + subcommand registration | 49 |
| `commands/snapshot.ts` | `slotprobe snapshot` command wiring | ~200 |
| `commands/diff.ts` | `slotprobe diff` command wiring | ~170 |
| `commands/check-collision.ts` | `slotprobe check-collision` command wiring | ~200 |
| `commands/generate-migration.ts` | `slotprobe generate-migration` command wiring | ~200 |
| `formatters/terminal.ts` | Chalk-colored terminal output | ~80 |
| `formatters/markdown.ts` | Markdown table output | ~90 |
| `formatters/json.ts` | JSON output for CI | ~80 |

---

## 📚 How to Learn Each Module

For each module, follow this three-step process:

### Step 1: Read the Code

Every file has a module-level docstring (the `/** ... @module */` block at the top) that explains:
- What the module does
- How it fits into the larger system
- Key design decisions

Functions have NatSpec-style docstrings with `@param`, `@returns`, and `@example` blocks. Read them — they were written specifically for contributors.

### Step 2: Plug In Real Values

Don't just read — **run the code**. For every module:

1. Create a scratch file: `npx tsx scratch.ts`
2. Import the function you're studying
3. Call it with real data and `console.log` the result
4. Compare with what you expected

**Example for the decoder:**

```typescript
import { decodeValue } from './src/core/storage-engine/decoder.js'
import { extractPackedValue } from './src/core/storage-engine/packed.js'

// A packed slot with uint128 a=100 at offset 0 and uint128 b=200 at offset 16
const packedSlot = '0x000000000000000000000000000000c800000000000000000000000000000064'

// Extract b (offset 16, 16 bytes)
const bRaw = extractPackedValue(packedSlot, 16, 16)
console.log('b raw:', bRaw)
console.log('b decoded:', decodeValue(bRaw, 't_uint128'))

// Extract a (offset 0, 16 bytes)
const aRaw = extractPackedValue(packedSlot, 0, 16)
console.log('a raw:', aRaw)
console.log('a decoded:', decodeValue(aRaw, 't_uint128'))
```

### Step 3: Write a Test

The fastest way to verify you truly understand a function is to write a test for it. Tests live in `src/test/unit/` and `src/test/intergration/`. Look at existing tests for patterns, then write your own:

```typescript
import { describe, it, expect } from 'vitest'
import { mappingSlot } from '../../core/storage-engine/slot-calculator.js'

describe('My understanding of mappingSlot', () => {
  it('produces a deterministic slot from key + baseSlot', () => {
    const slot1 = mappingSlot('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 0n)
    const slot2 = mappingSlot('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 0n)
    expect(slot1).toBe(slot2) // same input → same output

    const slot3 = mappingSlot('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', 1n)
    expect(slot3).not.toBe(slot1) // different base slot → different result
  })
})
```

---

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npx vitest run

# Run tests in watch mode (re-runs on file changes)
npx vitest

# Run a specific test file
npx vitest run src/test/unit/decoder.test.ts

# Run with coverage
npx vitest run --coverage
```

### Test Structure

```
src/test/
├── unit/                         # Pure function tests (no network)
│   ├── slot-calculator.test.ts   # keccak256 slot math
│   ├── decoder.test.ts           # Hex → typed value decoding
│   ├── packed.test.ts            # Packed slot extraction
│   ├── reader.test.ts            # Slot reader (mocked RPC)
│   ├── artifact-parser.test.ts   # Foundry/Hardhat parsing
│   ├── capture.test.ts           # Snapshot capture pipeline
│   ├── batch.test.ts             # Concurrency limiter
│   ├── retry.test.ts             # Retry logic
│   ├── client.test.ts            # Viem client factory
│   ├── chains.test.ts            # Chain metadata
│   └── config.test.ts            # Config loading
└── intergration/                 # Tests that may use Anvil forks
    ├── snapshot.test.ts           # End-to-end snapshot capture
    ├── diff.test.ts               # Snapshot comparison
    ├── collision.test.ts          # Storage collision detection
    └── migration.test.ts          # Migration generation + verification
```

### Writing Tests

- **Unit tests** go in `src/test/unit/`. Mock external dependencies (RPC, filesystem).
- **Integration tests** go in `src/test/intergration/`. These may spawn Anvil and read real chain state at a pinned block number.
- Use `describe/it/expect` from vitest (it's configured globally).
- Test filenames must end with `.test.ts` and live under `src/test/`.

---

## ⚙️ Configuration

SlotProbe auto-discovers config from the project root. Supported filenames:

- `.SlotProberc.json`
- `.slotprobe.json`
- `slotprobe.config.json`

All fields are optional — defaults are applied automatically:

```json
{
  "defaultChain": "mainnet",
  "rpc": {
    "maxConcurrent": 50,
    "retries": 3,
    "backoffMs": 1000
  },
  "output": "terminal",
  "chains": {
    "mainnet": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "base": "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "optimism": "https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "polygon": "https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY"
  },
  "artifactsDir": "./out",
  "snapshotsDir": "./snapshots"
}
```

Config values are always overridden by CLI flags.

---

## 🛠 Tech Stack

| Category | Package | Purpose |
|----------|---------|---------|
| **Language** | TypeScript 5.x | Type safety for complex EVM data types and bigint arithmetic |
| **Blockchain** | `viem` ^2.x | Primary RPC client — type-safe `eth_getStorageAt` calls |
| **Validation** | `zod` ^4.x | Runtime schema validation for config, layouts, and snapshots |
| **CLI** | `commander` ^14.x | Subcommand routing and flag parsing |
| **CLI** | `chalk` ^5.x | Colored terminal output |
| **CLI** | `ora` ^9.x | Terminal spinners for async operations |
| **CLI** | `cli-table3` ^0.6.x | Tabular terminal output |
| **Templates** | `handlebars` ^4.x | Migration script generation |
| **Concurrency** | `p-limit` ^7.x | RPC call concurrency control |
| **Retry** | `p-retry` ^8.x | Exponential backoff for transient RPC failures |
| **Testing** | `vitest` ^4.x | Fast TypeScript-native test runner |
| **Build** | `tsup` ^8.x | ESM bundling for distribution |
| **Dev** | `tsx` ^4.x | Run TypeScript directly during development |

---

## 📍 Project Status

### v1 Core — Implemented ✅

- [x] EVM storage engine (slot reading + decoding + packed slots)
- [x] Artifact parser (Foundry + Hardhat auto-detection)
- [x] Recursive snapshot capture (scalars, structs, dynamic arrays, fixed arrays, mappings)
- [x] `--only` flag for targeted snapshots
- [x] `--dry-run` estimation mode
- [x] Basic mapping support via user-supplied key files
- [x] RPC batching + retry + rate limiting
- [x] Semantic diff engine (variable-name-level comparison)
- [x] Terminal, JSON, and Markdown output formatters
- [x] Storage collision detector (byte-range overlap with comparison regions)
- [x] Proxy-pattern-aware collision filtering (EIP-1967, Transparent, UUPS)
- [x] Migration script generator (Foundry + Hardhat templates)
- [x] `--verify` flag with Anvil fork validation
- [x] CLI wiring for all 4 commands
- [x] 11 unit test files + 4 integration test files

### v2 Roadmap — Planned

- [ ] Cross-chain consistency checker
- [ ] Full mapping enumeration via event log indexing
- [ ] Etherscan auto-fetch for contracts without local artifacts
- [ ] Diamond proxy (EIP-2535) support
- [ ] Snapshot timeline — track variable changes over time

---

## 🤝 Contributing

SlotProbe is open source under the MIT License. We welcome contributions of all sizes.

### Getting Started

1. **Fork** the repository
2. **Clone** your fork and install dependencies: `npm install`
3. **Read** this README's [Contributor Guide](#-contributor-guide--where-to-start) from Layer 1 up
4. **Run** the tests to make sure everything passes: `npx vitest run`
5. **Pick** an issue or improvement you want to work on

### Pull Request Process

1. Create a feature branch: `git checkout -b feat/your-feature`
2. Write tests for everything you build
3. Make sure `npx vitest run` passes with your changes
4. Submit a PR with a clear description of **what** you changed and **why**

### Code Standards

- Every file has a module-level `/** ... @module */` docstring
- Every exported function has NatSpec-style documentation with `@param`, `@returns`, and `@example`
- No `any` types — use `unknown` and narrow with type guards
- All slot numbers are `bigint` (never `number`)
- ESM modules with `.js` extension in imports (TypeScript `nodenext` resolution)

### Responsible Disclosure

**If you find a real storage bug in a protocol using SlotProbe:** Disclose it responsibly to the protocol team first, following their security disclosure process. Once resolved, we encourage sharing your findings publicly — the community gets stronger when tooling catches real issues.

---

## 📄 License

MIT © SlotProbe Contributors

---

*Built because every serious protocol team was doing this manually with spreadsheets.*
