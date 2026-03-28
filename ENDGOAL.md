# 🔬 SlotProbe

> **The missing developer tool for Web3** — snapshot, diff, and migrate smart contract state across upgrades and chains. No more manual slot hunting. No more blind upgrades.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Built for EVM](https://img.shields.io/badge/Built%20for-EVM-purple)](https://ethereum.org)

---

## 📖 Table of Contents

- [The Problem](#-the-problem)
- [Why SlotProbe Doesn't Exist Yet](#-why-SlotProbe-doesnt-exist-yet)
- [What SlotProbe Does](#-what-SlotProbe-does)
- [Key Features](#-key-features)
- [How It Works (Architecture)](#-how-it-works-architecture)
- [Tech Stack](#-tech-stack)
- [Skills You Need to Build This](#-skills-you-need-to-build-this)
- [Project Structure](#-project-structure)
- [Step-by-Step Build Guide](#-step-by-step-build-guide)
  - [Phase 1 — EVM Storage Engine](#phase-1--evm-storage-engine)
  - [Phase 2 — Artifact Parser](#phase-2--artifact-parser)
  - [Phase 3 — Snapshot System](#phase-3--snapshot-system)
  - [Phase 4 — Diff Engine](#phase-4--diff-engine)
  - [Phase 5 — Migration Generator](#phase-5--migration-generator)
  - [Phase 6 — Multi-Chain Consistency Checker](#phase-6--multi-chain-consistency-checker)
  - [Phase 7 — CLI Interface](#phase-7--cli-interface)
  - [Phase 8 — Foundry & Hardhat Plugins](#phase-8--foundry--hardhat-plugins)
- [Standout Features to Add](#-standout-features-to-add)
- [Testing Strategy](#-testing-strategy)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## 🔥 The Problem

Every serious smart contract protocol eventually faces these painful situations:

**Situation 1 — Upgrading a Proxy Contract**

You've deployed a UUPS upgradeable proxy. You write a new implementation. You run `forge upgrade`. 

*But did your new implementation accidentally overwrite storage slot 3 — the one your old contract used for `_owner`?*

There's no tool that will tell you this clearly, before the upgrade corrupts live state on mainnet. Slither has a basic collision check, but it gives you raw slot numbers and no workflow. You end up manually comparing compiler output, slot by slot, hoping you don't miss something. Protocols have lost **millions of dollars** to storage collisions in upgradeable contracts.

**Situation 2 — Deploying Across Multiple Chains**

Your protocol is live on Ethereum, Arbitrum, Base, and Optimism. Governance passed a parameter update on Ethereum three weeks ago. *Did that change get applied to the Arbitrum deployment?* 

There is currently no tool that lets you query the same contract across chains, compare their state, and flag divergences. Teams do this manually with spreadsheets. Or they don't do it at all.

**Situation 3 — Post-Upgrade State Audit**

You upgraded a contract. You *think* the migration went fine. But did all the old state migrate correctly? Are there mappings with stale values? Did any storage variable move slots between versions?

You currently have no way to take a snapshot *before* and *after* an upgrade and semantically diff them at the variable name level — not the raw hex level.

**The result:** Protocol engineers waste days on what should be a 5-minute CLI command. And sometimes they make mistakes that cost millions.

---

## 🔍 Why SlotProbe Doesn't Exist Yet

Before building this, we verified the landscape of existing tools:

| Tool | What it Does | What it Misses |
|---|---|---|
| `sol2uml` | Visualizes storage layout as diagrams | No live state, no diffs, no migration |
| `hardhat-storage-layout` | Prints slot table from compiled artifacts | No live values, no diff, no cross-chain |
| `slither-read-storage` | Reads raw storage slots from a live contract | No variable name mapping, no diff, no migration |
| `SmartMuv` | Extracts storage state for migration | No semantic diff, no cross-chain checker, no script generation |
| Tenderly | Monitors live contract state | No upgrade diffs, no migration tooling, no offline workflow |
| OpenZeppelin Upgrades | Validates upgrade compatibility | Limited to layout collision check, no live state diff |

**SlotProbe is the first tool to combine all five capabilities into one workflow:**
snapshot → semantic diff → collision detection → migration script generation → cross-chain consistency check.

---

## ✅ What SlotProbe Does

```bash
# Take a snapshot of a contract's state before an upgrade
SlotProbe snapshot 0xUniswapV3Pool --chain mainnet --block 19000000 --out before.json

# Take a snapshot after the upgrade
SlotProbe snapshot 0xUniswapV3Pool --chain mainnet --block 19001000 --out after.json

# Diff the two snapshots — by variable name, not by raw slot
SlotProbe diff before.json after.json

# Check if a storage collision would occur in a proposed upgrade
SlotProbe check-collision ./old/MyContract.json ./new/MyContract.json

# Verify that the same contract has consistent state across chains
SlotProbe cross-chain 0xUniswapV3Pool --chains mainnet,arbitrum,base --vars fee,tickSpacing

# Auto-generate a Foundry migration script from a diff
SlotProbe generate-migration before.json after.json --format foundry --out migrate.s.sol
```

---

## ⚡ Key Features

### 1. Semantic State Snapshots
SlotProbe reads raw EVM storage slots via `eth_getStorageAt` and maps them back to **named Solidity variables** using the compiler's `storageLayout` output. Instead of seeing `slot 3 = 0x000...0001`, you see `_owner = 0xab12...`.

Supports:
- Simple types (uint, address, bool, bytes32)
- Packed slots (multiple variables in one 32-byte slot)
- Dynamic arrays (reads length + elements)
- Mappings (with user-supplied key sets)
- Nested structs
- All proxy patterns (EIP-1967, Transparent, UUPS, Diamond/EIP-2535)

### 2. Human-Readable Diff Engine
Like `git diff`, but for contract storage. SlotProbe diffs two snapshots and outputs:

```diff
Contract: UniswapV3Pool (0xabc...123)
Block: 19000000 → 19001000

  fee: 3000 (unchanged)
- tickSpacing: 60
+ tickSpacing: 10
- _owner: 0xDead...Beef
+ _owner: 0xAlice...1234
  liquidity: 4823947239847 (unchanged)
```

### 3. Storage Collision Detector
Compares two contract versions' compiled storage layouts and flags any slot conflicts **before** deployment. Goes beyond OpenZeppelin's basic check — handles Diamond proxies, inheritance chains, and packed slot edge cases.

### 4. Cross-Chain Consistency Checker
Point SlotProbe at the same contract address across multiple chains. It will read the same set of state variables on each chain and produce a report of what is in sync and what has diverged.

### 5. Migration Script Generator
Given a diff, SlotProbe generates a ready-to-run Foundry or Hardhat migration script. The generated script handles:
- Setting changed values on the new contract
- Migrating dynamic array contents
- Batch operations to minimize gas
- Verification checks post-migration

### 6. CI/CD Integration
SlotProbe can run in CI pipelines — fail the build if a proposed upgrade would cause storage collisions, or if cross-chain state has drifted beyond acceptable thresholds.

---

## 🏗 How It Works (Architecture)

```
┌─────────────────────────────────────────────────────────────────┐
│                        SlotProbe CLI                            │
│         snapshot | diff | check-collision | cross-chain         │
│                    generate-migration                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
┌─────────────────┐ ┌──────────────┐ ┌─────────────────┐
│  Artifact       │ │  EVM Storage │ │  Multi-chain    │
│  Parser         │ │  Engine      │ │  RPC Manager    │
│                 │ │              │ │                 │
│ Foundry JSON    │ │ eth_getStorAt│ │ viem clients    │
│ Hardhat JSON    │ │ Slot decoder │ │ per chain       │
│ storageLayout   │ │ Type mapper  │ │                 │
└────────┬────────┘ └──────┬───────┘ └────────┬────────┘
         │                 │                  │
         └─────────────────▼──────────────────┘
                           │
                  ┌────────▼────────┐
                  │  Snapshot Store │
                  │  (JSON files)   │
                  └────────┬────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
     ┌──────────────┐ ┌─────────┐ ┌──────────────────┐
     │ Diff Engine  │ │Collision│ │Migration Script  │
     │              │ │Detector │ │Generator         │
     │ Semantic     │ │         │ │                  │
     │ variable-    │ │Slot     │ │Handlebars        │
     │ level diff   │ │overlap  │ │Templates         │
     │              │ │checker  │ │(Foundry/Hardhat) │
     └──────┬───────┘ └────┬────┘ └────────┬─────────┘
            │              │               │
            └──────────────▼───────────────┘
                           │
                  ┌────────▼────────┐
                  │  Output Layer   │
                  │  Terminal / JSON│
                  │  / HTML Report  │
                  └─────────────────┘
```

---

## 🛠 Tech Stack

### Core Language
**TypeScript 5.x** — The entire Web3 tooling ecosystem lives here. Type safety will save you enormous debugging time when dealing with complex EVM data types.

### Blockchain Interaction
| Package | Version | Purpose |
|---|---|---|
| `viem` | `^2.x` | Primary RPC client. Type-safe, modern, fast. Used for all `eth_getStorageAt` calls |
| `ethers` | `^6.x` | Secondary compatibility layer. Some Hardhat plugins still expect ethers |

### EVM & Solidity
| Tool | Purpose |
|---|---|
| `solc` compiler output | The `storageLayout` JSON field tells you exactly which slot each variable occupies. This is your foundation |
| Foundry build artifacts | `out/ContractName.sol/ContractName.json` — contains ABI + full storage layout |
| Hardhat artifacts | `artifacts/contracts/...` — slightly different format, same data |

### CLI Framework
| Package | Purpose |
|---|---|
| `commander` | Subcommand routing (`snapshot`, `diff`, `check-collision`, etc.) |
| `ora` | Terminal spinners while waiting for RPC responses |
| `chalk` | Colored terminal output for diffs (red = removed, green = added) |
| `cli-table3` | Tabular output for storage layout and diff reports |
| `inquirer` | Interactive prompts when config is missing |

### Data Processing
| Package | Purpose |
|---|---|
| `zod` | Config file schema validation (`.SlotProberc.json`) |
| `deep-diff` | Base diffing primitive — you'll extend it for semantic awareness |
| `handlebars` | Template engine for migration script code generation |
| `keccak256` (from viem) | Computing mapping and dynamic array slot positions |

### Testing
| Tool | Purpose |
|---|---|
| `vitest` | Fast, TypeScript-native test runner |
| `anvil` (Foundry) | Local EVM fork. You fork mainnet and run integration tests against real contracts |
| `viem/test` | Mock RPC responses for unit tests |

### Build & Distribution
| Tool | Purpose |
|---|---|
| `tsup` | Bundles your library so others can `import SlotProbe from 'SlotProbe'` programmatically |
| `tsx` | Run TypeScript directly during development |
| `changesets` | Version management and changelog generation |

---

## 📚 Skills You Need to Build This

This is a hard project. Here is an honest breakdown of every skill you need, what level you need it at, and exactly where to learn it.

---

### 1. TypeScript (Required — Intermediate Level)

You need to be comfortable with generics, type guards, discriminated unions, and async/await patterns. You don't need to be an expert, but you need to be past beginner.

**Where to learn:**
- [The TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) — official, free, comprehensive. Start here.
- [Execute Program — TypeScript](https://www.executeprogram.com/courses/typescript) — interactive browser exercises. Paid but very effective.
- [Matt Pocock's Total TypeScript](https://www.totaltypescript.com/) — free beginner tutorials on YouTube, paid advanced workshops. Matt is the best TypeScript teacher in the ecosystem.

**What to focus on:** Generics, `unknown` vs `any`, discriminated unions, `zod` for runtime validation, async patterns.

---

### 2. EVM Storage Layout (Required — This Is the Core Skill)

This is the hardest and most important thing to learn for this project. You need to understand how Solidity stores variables in 32-byte slots, how mappings compute their slot using keccak256, how dynamic arrays work, how packed storage works, and how the `solc` compiler exposes this via the `storageLayout` output.

**Where to learn:**
- [Solidity Docs — Layout of State Variables in Storage](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html) — read this until you fully understand it. This is your bible.
- [Trail of Bits Blog — Shedding Smart Contract Storage with Slither](https://blog.trailofbits.com/2022/07/28/shedding-smart-contract-storage-with-slither/) — excellent practical walkthrough.
- [OpenZeppelin Blog — Storage Gaps](https://docs.openzeppelin.com/contracts/4.x/upgradeable#storage_gaps) — explains why storage layout matters for upgrades.
- [EVM Codes](https://www.evm.codes/) — reference for every EVM opcode. You'll use this to understand SLOAD/SSTORE.
- [Noxx's EVM Deep Dives on Mirror.xyz](https://noxx.substack.com/) — some of the best EVM internals writing available, free.

**What to practice:** Manually calculate the slot for a mapping key. Manually figure out where a struct's second field lives. Then verify with `slither-read-storage` or `cast storage`.

---

### 3. Foundry (Required — Beginner to Intermediate)

Foundry is the modern smart contract development framework. You'll use Anvil (its local EVM) for integration tests, and you need to understand its artifact format to parse `storageLayout` from build output.

**Where to learn:**
- [Foundry Book](https://book.getfoundry.sh/) — the official documentation. Free. Work through the entire Getting Started section and the Testing chapter.
- [Patrick Collins — Learn Foundry YouTube Series](https://www.youtube.com/watch?v=umepbfKp5rI) — free, comprehensive, beginner-friendly video course.

**What to practice:** `forge build` and inspect the `out/` folder JSON. Run `cast storage <address> <slot>` against a fork to manually verify slot values.

---

### 4. Viem (Required — Beginner)

Viem is your primary RPC client. It's well-documented and you'll pick it up fast if you know TypeScript.

**Where to learn:**
- [Viem Official Docs](https://viem.sh/docs/getting-started) — start with Getting Started, then read the `getStorageAt` reference carefully.
- Work through the examples in the docs. Viem's TypeScript types will guide you well.

---

### 5. Node.js CLI Development (Required — Beginner)

Building a CLI is more involved than building a library. You need to understand argument parsing, process exit codes, stdin/stdout, and how to distribute a CLI via npm.

**Where to learn:**
- [Commander.js README](https://github.com/tj/commander.js) — the README alone teaches you 90% of what you need.
- [How to Build a CLI with Node.js — Smashing Magazine](https://www.smashingmagazine.com/2017/03/building-commandline-tools-node-npm/) — free article, practical walkthrough.
- [npm — Creating and Publishing Packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages) — for when you're ready to publish.

---

### 6. Solidity Basics (Required — Beginner)

You don't need to be a Solidity developer, but you need to read Solidity code fluently. You need to understand inheritance, proxy patterns (what UUPS vs Transparent means), and how `delegatecall` works.

**Where to learn:**
- [CryptoZombies](https://cryptozombies.io/) — free, gamified, beginner-friendly introduction to Solidity.
- [Solidity by Example](https://solidity-by-example.org/) — short practical code snippets covering every concept. Free.
- [OpenZeppelin Contracts — Upgrades Plugin Docs](https://docs.openzeppelin.com/upgrades-plugins/1.x/) — read the proxy patterns section specifically.

---

### 7. Proxy Patterns (Required — Intermediate)

Understanding EIP-1967, Transparent Proxy, UUPS, and EIP-2535 Diamond is non-negotiable. Your tool needs to handle all of them because real protocols use all of them.

**Where to learn:**
- [OpenZeppelin — Proxy Upgrade Pattern](https://docs.openzeppelin.com/contracts/4.x/api/proxy) — official documentation with clear diagrams.
- [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967) — the actual standard. Read it.
- [EIP-2535 Diamond Standard](https://eips.ethereum.org/EIPS/eip-2535) — the Diamond proxy pattern. Complex but well-documented.
- [Rareskills — Proxy Patterns](https://www.rareskills.io/post/proxy-patterns) — free, excellent breakdown of all patterns with diagrams.

---

### 8. Code Generation with Templates (Nice to Have — Beginner)

For the migration script generator, you'll use Handlebars to generate Solidity/Foundry code from templates.

**Where to learn:**
- [Handlebars.js Docs](https://handlebarsjs.com/guide/) — the official guide covers everything you need. Free.

---

### 9. Testing with Vitest + Anvil (Required — Beginner)

Your integration tests will fork mainnet using Anvil, then run your tool against real contracts with known storage layouts.

**Where to learn:**
- [Vitest Docs](https://vitest.dev/guide/) — official guide. Clear and concise.
- [Foundry Book — Anvil](https://book.getfoundry.sh/anvil/) — specifically the `--fork-url` flag for mainnet forking.

---

## 📁 Project Structure

```
SlotProbe/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point (Commander setup)
│   │   ├── commands/
│   │   │   ├── snapshot.ts       # SlotProbe snapshot command
│   │   │   ├── diff.ts           # SlotProbe diff command
│   │   │   ├── check-collision.ts
│   │   │   ├── cross-chain.ts
│   │   │   └── generate-migration.ts
│   │   └── formatters/
│   │       ├── terminal.ts       # Chalk + cli-table3 output
│   │       ├── json.ts           # JSON output
│   │       └── html.ts           # HTML report output
│   │
│   ├── core/
│   │   ├── storage-engine/
│   │   │   ├── reader.ts         # eth_getStorageAt wrapper
│   │   │   ├── slot-calculator.ts # keccak256 slot math for mappings/arrays
│   │   │   ├── decoder.ts        # Raw hex → typed Solidity value
│   │   │   └── packed.ts         # Packed slot handling
│   │   │
│   │   ├── artifact-parser/
│   │   │   ├── foundry.ts        # Parse Foundry out/ JSON artifacts
│   │   │   ├── hardhat.ts        # Parse Hardhat artifacts/
│   │   │   ├── types.ts          # Shared StorageLayout type definitions
│   │   │   └── normalizer.ts     # Normalize both formats to common schema
│   │   │
│   │   ├── snapshot/
│   │   │   ├── capture.ts        # Orchestrates a full snapshot
│   │   │   ├── store.ts          # Read/write snapshot JSON files
│   │   │   └── types.ts          # Snapshot schema types
│   │   │
│   │   ├── diff/
│   │   │   ├── engine.ts         # Core diff logic
│   │   │   ├── semantic.ts       # Variable-name-level diff (not raw slots)
│   │   │   └── types.ts          # DiffResult types
│   │   │
│   │   ├── collision/
│   │   │   ├── detector.ts       # Storage slot collision detection
│   │   │   ├── proxy-handler.ts  # Per-proxy-pattern collision logic
│   │   │   └── report.ts         # Collision report formatting
│   │   │
│   │   ├── cross-chain/
│   │   │   ├── checker.ts        # Queries same vars across multiple chains
│   │   │   └── consistency.ts    # Generates consistency report
│   │   │
│   │   └── migration/
│   │       ├── generator.ts      # Generates migration scripts from diffs
│   │       └── templates/
│   │           ├── foundry.hbs   # Foundry script template
│   │           └── hardhat.hbs   # Hardhat script template
│   │
│   ├── rpc/
│   │   ├── client.ts             # viem client factory per chain
│   │   ├── chains.ts             # Chain configs (mainnet, arbitrum, base, etc.)
│   │   └── retry.ts              # RPC retry logic with exponential backoff
│   │
│   └── config/
│       ├── loader.ts             # Load .SlotProberc.json
│       └── schema.ts             # zod config schema
│
├── test/
│   ├── unit/
│   │   ├── slot-calculator.test.ts
│   │   ├── decoder.test.ts
│   │   ├── artifact-parser.test.ts
│   │   └── diff-engine.test.ts
│   │
│   └── integration/
│       ├── snapshot.test.ts      # Forks mainnet, snapshots real contracts
│       ├── diff.test.ts
│       └── collision.test.ts
│
├── templates/                    # Handlebars migration templates
├── .SlotProberc.example.json     # Example config file
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🪜 Step-by-Step Build Guide

Follow these phases in order. Each phase produces something testable before you move to the next.

---

### Phase 1 — EVM Storage Engine

**Goal:** Given a contract address, chain RPC URL, and slot number, return the decoded value at that slot.

**What to build:** `src/core/storage-engine/`

**Step 1.1 — Set up the project**

```bash
mkdir SlotProbe && cd SlotProbe
npm init -y
npm install -D typescript @types/node tsx vitest tsup
npm install viem zod chalk ora commander cli-table3 handlebars deep-diff
npx tsc --init
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true
  }
}
```

**Step 1.2 — Build the RPC client factory**

```typescript
// src/rpc/client.ts
import { createPublicClient, http } from 'viem'
import { mainnet, arbitrum, base, optimism } from 'viem/chains'

const CHAIN_MAP = { mainnet, arbitrum, base, optimism }

export function getClient(chainName: keyof typeof CHAIN_MAP, rpcUrl?: string) {
  const chain = CHAIN_MAP[chainName]
  return createPublicClient({
    chain,
    transport: http(rpcUrl ?? chain.rpcUrls.default.http[0])
  })
}
```

**Step 1.3 — Build the raw slot reader**

```typescript
// src/core/storage-engine/reader.ts
import { getClient } from '../../rpc/client'

export async function readSlot(
  address: `0x${string}`,
  slot: bigint,
  chainName: string,
  blockNumber?: bigint
): Promise<`0x${string}`> {
  const client = getClient(chainName as any)
  return client.getStorageAt({
    address,
    slot: `0x${slot.toString(16)}` as `0x${string}`,
    blockNumber
  }) as Promise<`0x${string}`>
}
```

**Step 1.4 — Build the slot calculator for mappings and dynamic arrays**

This is the most complex part of Phase 1. Study the Solidity storage docs first.

```typescript
// src/core/storage-engine/slot-calculator.ts
import { keccak256, encodePacked, pad } from 'viem'

// For a mapping(address => uint256) at base slot N:
// The slot for key K is keccak256(abi.encode(K, N))
export function mappingSlot(key: `0x${string}`, baseSlot: bigint): bigint {
  const encoded = encodePacked(
    ['bytes32', 'uint256'],
    [pad(key), baseSlot]
  )
  return BigInt(keccak256(encoded))
}

// For a dynamic array at base slot N:
// Length is at slot N. Element i is at keccak256(N) + i
export function arrayElementSlot(baseSlot: bigint, index: bigint): bigint {
  const base = BigInt(keccak256(pad(`0x${baseSlot.toString(16)}`)))
  return base + index
}
```

**Step 1.5 — Build the type decoder**

Maps raw 32-byte hex values to typed Solidity values based on the type string from `storageLayout`.

```typescript
// src/core/storage-engine/decoder.ts
export function decodeValue(rawHex: string, type: string): unknown {
  const value = BigInt(rawHex)

  if (type === 'bool') return value !== 0n
  if (type.startsWith('uint')) return value.toString()
  if (type.startsWith('int')) {
    const bits = parseInt(type.replace('int', '')) || 256
    const max = 2n ** BigInt(bits - 1)
    return (value >= max ? value - 2n ** BigInt(bits) : value).toString()
  }
  if (type === 'address') return `0x${rawHex.slice(-40)}`
  if (type.startsWith('bytes')) return rawHex
  return rawHex // fallback for complex types
}
```

**Milestone:** You can call `readSlot(address, 0n, 'mainnet')` and get back a decoded value. Test this against a known contract on a mainnet fork using Anvil.

---

### Phase 2 — Artifact Parser

**Goal:** Given a Foundry or Hardhat build artifact, extract a normalized `StorageLayout` object that maps each variable to its slot, offset, type, and size.

**What to build:** `src/core/artifact-parser/`

**Step 2.1 — Define the normalized schema**

```typescript
// src/core/artifact-parser/types.ts
export interface StorageVariable {
  name: string
  type: string
  slot: bigint
  offset: number          // byte offset within the slot (for packed vars)
  numberOfBytes: number
  label: string           // human-readable type (e.g. "mapping(address => uint256)")
}

export interface StorageLayout {
  contractName: string
  variables: StorageVariable[]
  types: Record<string, TypeInfo>
}

export interface TypeInfo {
  encoding: 'inplace' | 'mapping' | 'dynamic_array' | 'bytes'
  numberOfBytes: number
  members?: StorageVariable[]  // for structs
  key?: string                 // for mappings
  value?: string               // for mappings
  base?: string                // for arrays
}
```

**Step 2.2 — Parse Foundry artifacts**

Foundry outputs artifacts to `out/ContractName.sol/ContractName.json`. The storage layout is under the `storageLayout` key.

```typescript
// src/core/artifact-parser/foundry.ts
import { readFileSync } from 'fs'
import type { StorageLayout } from './types'

export function parseFoundryArtifact(artifactPath: string): StorageLayout {
  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8'))
  const layout = raw.storageLayout

  return {
    contractName: raw.contractName,
    variables: layout.storage.map((v: any) => ({
      name: v.label,
      type: v.type,
      slot: BigInt(v.slot),
      offset: v.offset,
      numberOfBytes: parseInt(layout.types[v.type]?.numberOfBytes ?? '32'),
      label: v.label
    })),
    types: layout.types
  }
}
```

**Step 2.3 — Parse Hardhat artifacts**

Hardhat stores artifacts in `artifacts/contracts/.../<ContractName>.json` but storage layout requires enabling `outputSelection` in `hardhat.config.ts`. Document this requirement clearly for users.

**Milestone:** You can pass any Foundry or Hardhat artifact file path to your parser and get back a normalized `StorageLayout` with named variables and their slots.

---

### Phase 3 — Snapshot System

**Goal:** Combine the storage engine and artifact parser to capture a full semantic snapshot of a live contract's state.

**What to build:** `src/core/snapshot/`

**Step 3.1 — Build the snapshot capture logic**

```typescript
// src/core/snapshot/capture.ts
import { readSlot, mappingSlot, arrayElementSlot } from '../storage-engine'
import type { StorageLayout, StorageVariable } from '../artifact-parser/types'

export interface SnapshotEntry {
  name: string
  type: string
  slot: bigint
  rawValue: string
  decodedValue: unknown
}

export interface Snapshot {
  address: string
  chain: string
  blockNumber: bigint
  timestamp: number
  contractName: string
  state: SnapshotEntry[]
}

export async function captureSnapshot(
  address: `0x${string}`,
  layout: StorageLayout,
  chain: string,
  blockNumber?: bigint
): Promise<Snapshot> {
  const entries: SnapshotEntry[] = []

  for (const variable of layout.variables) {
    const raw = await readSlot(address, variable.slot, chain, blockNumber)
    entries.push({
      name: variable.name,
      type: variable.type,
      slot: variable.slot,
      rawValue: raw,
      decodedValue: decodeValue(raw, variable.type)
    })
  }

  return {
    address,
    chain,
    blockNumber: blockNumber ?? 0n,
    timestamp: Date.now(),
    contractName: layout.contractName,
    state: entries
  }
}
```

**Step 3.2 — Serialization (bigint-safe JSON)**

`JSON.stringify` cannot serialize `bigint`. You'll need a custom replacer:

```typescript
// src/core/snapshot/store.ts
export function saveSnapshot(snapshot: Snapshot, path: string) {
  const serializable = JSON.stringify(snapshot, (_, v) =>
    typeof v === 'bigint' ? v.toString() + 'n' : v, 2)
  writeFileSync(path, serializable)
}

export function loadSnapshot(path: string): Snapshot {
  return JSON.parse(readFileSync(path, 'utf-8'), (_, v) =>
    typeof v === 'string' && v.endsWith('n') ? BigInt(v.slice(0, -1)) : v)
}
```

**Milestone:** Run `SlotProbe snapshot` against a real contract on a mainnet fork and produce a human-readable JSON file showing all named variables and their values.

---

### Phase 4 — Diff Engine

**Goal:** Given two snapshots, produce a semantic diff at the variable name level.

**What to build:** `src/core/diff/`

**Step 4.1 — Core diff logic**

```typescript
// src/core/diff/engine.ts
import type { Snapshot, SnapshotEntry } from '../snapshot/capture'

export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DiffEntry {
  name: string
  type: string
  status: DiffStatus
  before?: unknown
  after?: unknown
}

export function diffSnapshots(before: Snapshot, after: Snapshot): DiffEntry[] {
  const results: DiffEntry[] = []
  const afterMap = new Map(after.state.map(e => [e.name, e]))

  for (const entry of before.state) {
    const afterEntry = afterMap.get(entry.name)
    if (!afterEntry) {
      results.push({ name: entry.name, type: entry.type, status: 'removed', before: entry.decodedValue })
    } else if (JSON.stringify(entry.decodedValue) !== JSON.stringify(afterEntry.decodedValue)) {
      results.push({ name: entry.name, type: entry.type, status: 'changed',
        before: entry.decodedValue, after: afterEntry.decodedValue })
    } else {
      results.push({ name: entry.name, type: entry.type, status: 'unchanged',
        before: entry.decodedValue })
    }
  }

  for (const entry of after.state) {
    if (!before.state.find(e => e.name === entry.name)) {
      results.push({ name: entry.name, type: entry.type, status: 'added', after: entry.decodedValue })
    }
  }

  return results
}
```

**Milestone:** `SlotProbe diff before.json after.json` produces a colored terminal output similar to `git diff`.

---

### Phase 5 — Migration Generator

**Goal:** Given a diff, generate a working Foundry or Hardhat script that migrates the changed state.

**What to build:** `src/core/migration/`

**Step 5.1 — Create the Foundry template**

```handlebars
{{! templates/foundry.hbs }}
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/{{contractName}}.sol";

contract Migrate{{contractName}} is Script {
    address constant CONTRACT = {{address}};

    function run() external {
        vm.startBroadcast();
        {{contractName}} c = {{contractName}}(CONTRACT);

        {{#each changes}}
        // Changed: {{this.name}} ({{this.before}} → {{this.after}})
        c.set{{capitalize this.name}}({{this.after}});
        {{/each}}

        vm.stopBroadcast();
    }
}
```

**Step 5.2 — Generator logic**

```typescript
// src/core/migration/generator.ts
import Handlebars from 'handlebars'
import { readFileSync } from 'fs'
import type { DiffEntry } from '../diff/engine'

Handlebars.registerHelper('capitalize', (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1))

export function generateMigration(
  diffs: DiffEntry[],
  contractName: string,
  address: string,
  format: 'foundry' | 'hardhat'
): string {
  const templatePath = `./templates/${format}.hbs`
  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'))
  const changes = diffs.filter(d => d.status === 'changed' || d.status === 'added')
  return template({ contractName, address, changes })
}
```

**Milestone:** `SlotProbe generate-migration before.json after.json --format foundry` outputs a `.s.sol` file you can run with `forge script`.

---

### Phase 6 — Multi-Chain Consistency Checker

**Goal:** Given a contract address and list of chains, read the same variables on each chain and report divergences.

**What to build:** `src/core/cross-chain/`

**Step 6.1 — Parallel chain queries**

```typescript
// src/core/cross-chain/checker.ts
export async function checkConsistency(
  address: `0x${string}`,
  chains: string[],
  layout: StorageLayout,
  variables?: string[] // optional filter to specific variable names
): Promise<ConsistencyReport> {
  const snapshots = await Promise.all(
    chains.map(chain => captureSnapshot(address, layout, chain))
  )

  const report: ConsistencyReport = { address, chains, results: [] }
  const filteredVars = variables
    ? layout.variables.filter(v => variables.includes(v.name))
    : layout.variables

  for (const variable of filteredVars) {
    const values = snapshots.map(s => ({
      chain: s.chain,
      value: s.state.find(e => e.name === variable.name)?.decodedValue
    }))

    const unique = new Set(values.map(v => JSON.stringify(v.value)))
    report.results.push({
      variable: variable.name,
      consistent: unique.size === 1,
      values
    })
  }

  return report
}
```

**Milestone:** `SlotProbe cross-chain 0x... --chains mainnet,arbitrum,base --vars fee,tickSpacing` outputs a clear table showing which variables match across chains and which have drifted.

---

### Phase 7 — CLI Interface

**Goal:** Wire all the above into a clean, polished CLI with Commander.js.

**What to build:** `src/cli/`

```typescript
// src/cli/index.ts
#!/usr/bin/env node
import { Command } from 'commander'
import { snapshotCommand } from './commands/snapshot'
import { diffCommand } from './commands/diff'
import { collisionCommand } from './commands/check-collision'
import { crossChainCommand } from './commands/cross-chain'
import { migrationCommand } from './commands/generate-migration'

const program = new Command()

program
  .name('SlotProbe')
  .description('Smart contract state diffing, collision detection, and migration tooling')
  .version('0.1.0')

program.addCommand(snapshotCommand)
program.addCommand(diffCommand)
program.addCommand(collisionCommand)
program.addCommand(crossChainCommand)
program.addCommand(migrationCommand)

program.parse()
```

Add to `package.json`:
```json
{
  "bin": {
    "SlotProbe": "./dist/cli/index.js"
  }
}
```

**Milestone:** `npm install -g .` and then run `SlotProbe --help` and see all subcommands listed cleanly.

---

### Phase 8 — Foundry & Hardhat Plugins

**Goal:** Let devs run SlotProbe from within their existing Foundry or Hardhat workflow without switching to a separate CLI.

**Hardhat Plugin:**
```typescript
// Plugin registers a new task: `npx hardhat SlotProbe:snapshot`
import { extendConfig, task } from 'hardhat/config'
task('SlotProbe:snapshot', 'Take a storage state snapshot').setAction(async (args, hre) => {
  // Reuse core snapshot logic
})
```

**Foundry Script:**
Foundry doesn't have a plugin system. Instead, provide a Solidity script template that users can copy into their `script/` folder, which calls your CLI tool as part of a `forge script` run.

---

## 🌟 Standout Features to Add

These will separate SlotProbe from everything else and make it go viral:

### 1. AI-Powered Migration Suggestions
Integrate the Anthropic API. When a diff is detected, send the variable names and types to Claude and ask it to suggest what the migration should do semantically — not just mechanically copy values, but reason about *why* they changed and whether the migration script is logically correct.

### 2. "Run Against the Top 50 Protocols" Mode
Build a script that runs SlotProbe against the top 50 DeFi protocols by TVL, checking for storage layout issues in their latest upgrades. This is your launch content. Publish the results.

### 3. GitHub Actions Integration
Provide a ready-made GitHub Actions workflow file:
```yaml
- name: Check storage collisions
  uses: SlotProbe/action@v1
  with:
    old-artifact: './artifacts/old/MyContract.json'
    new-artifact: './artifacts/new/MyContract.json'
    fail-on-collision: true
```

### 4. VS Code Extension
A sidebar panel that shows the storage layout of the currently open Solidity file, with live values pulled from a configured network. Devs can see variable values without leaving their editor.

### 5. Snapshot Timeline
Store multiple snapshots over time and generate a timeline view showing how each variable's value changed block by block. Useful for post-incident analysis.

### 6. Etherscan Integration
For contracts without local artifact files (e.g. deployed by someone else), automatically fetch verified source from Etherscan and compile it on-the-fly to get the storage layout.

### 7. Simulation Mode
Before running an actual migration, simulate it against an Anvil fork and verify all state was correctly migrated, then produce a verification report.

---

## 🧪 Testing Strategy

### Unit Tests (Vitest)

Test each pure function in isolation:
- Slot calculator: verify known keccak256 outputs for mapping and array slots
- Decoder: verify each Solidity type decodes correctly from known hex values
- Artifact parser: test against fixture JSON files from both Foundry and Hardhat
- Diff engine: test all four diff statuses (added, removed, changed, unchanged)

### Integration Tests (Vitest + Anvil)

Fork mainnet and test against real contracts with known storage:

```typescript
// test/integration/snapshot.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
// Start Anvil fork before tests, point to it for RPC calls
// Use a well-known contract like USDC or Uniswap V3 WETH/USDC pool
// Assert that key variables (e.g. totalSupply, decimals) decode correctly

describe('Snapshot Integration', () => {
  it('correctly reads USDC totalSupply from mainnet fork', async () => {
    // ...
  })
})
```

### End-to-End Tests

Script that runs the full CLI flow — snapshot → diff → generate-migration — against a locally deployed upgradeable contract on Anvil and verifies the output files.

---

## 📍 Roadmap

**v0.1 — Core (Build this first)**
- [x] EVM storage engine (slot reading + decoding)
- [x] Artifact parser (Foundry + Hardhat)
- [x] Snapshot capture and JSON serialization
- [x] Semantic diff engine
- [x] Terminal output with color

**v0.2 — Power Features**
- [ ] Storage collision detector
- [ ] Migration script generator (Foundry)
- [ ] Cross-chain consistency checker

**v0.3 — Ecosystem Integration**
- [ ] Hardhat plugin
- [ ] GitHub Actions workflow
- [ ] Etherscan auto-fetch for unverified artifacts

**v0.4 — Standout**
- [ ] AI migration suggestions
- [ ] VS Code extension
- [ ] Snapshot timeline viewer
- [ ] HTML report output

---

## 🤝 Contributing

SlotProbe is open source under the MIT License. Contributions are welcome and encouraged.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Write tests for what you build
4. Submit a pull request with a clear description

If you find a storage bug in a real protocol using SlotProbe, please disclose responsibly to the protocol team first, then share your findings publicly. The Web3 community gets stronger when we work together.

---

## 📄 License

MIT © SlotProbe Contributors

---

*Built by developers who got tired of hunting storage slots manually.*
