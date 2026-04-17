# 🔬 SlotProbe v1

> **The missing developer tool for Web3** — snapshot, diff, and safely migrate smart contract state across upgrades. No more manual slot hunting. No more blind upgrades.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![Built for EVM](https://img.shields.io/badge/Built%20for-EVM-purple)](https://ethereum.org)

---

## 📖 Table of Contents

- [The Problem](#-the-problem)
- [Why SlotProbe Doesn't Exist Yet](#-why-SlotProbe-doesnt-exist-yet)
- [What SlotProbe v1 Does](#-what-SlotProbe-v1-does)
- [v1 Scope — What's In, What's Out](#-v1-scope--whats-in-whats-out)
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
  - [Phase 5 — Migration Generator + Verify](#phase-5--migration-generator--verify)
  - [Phase 6 — CLI Interface](#phase-6--cli-interface)
- [CLI Reference](#-cli-reference)
- [Configuration File](#-configuration-file)
- [Testing Strategy](#-testing-strategy)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)

---

## 🔥 The Problem

Every serious smart contract protocol eventually faces these painful situations:

**Situation 1 — Upgrading a Proxy Contract**

You've deployed a UUPS upgradeable proxy. You write a new implementation. You run `forge upgrade`.

*But did your new implementation accidentally overwrite storage slot 3 — the one your old contract used for `_owner`?*

There is no tool that will tell you this clearly before the upgrade corrupts live state on mainnet. Slither has a basic collision check, but it gives you raw slot numbers and no workflow around them. You end up manually comparing compiler output, slot by slot, hoping you don't miss something. Protocols have lost **millions of dollars** to storage collisions in upgradeable contracts.

**Situation 2 — Post-Upgrade State Audit**

You upgraded a contract. You *think* the migration went fine. But did all the old state migrate correctly? Are there mappings with stale values? Did any storage variable move slots between versions?

You currently have no way to take a snapshot *before* and *after* an upgrade and semantically diff them at the variable name level — not the raw hex level.

**Situation 3 — Blind Migration Scripts**

You write a migration script. You run it. You hope it worked. There is no standard way to automatically verify that a migration script's output matches what you actually intended. Teams verify migrations manually or not at all.

---

## 🔍 Why SlotProbe Doesn't Exist Yet

Before building this, the landscape was verified:

| Tool | What it Does | What it Misses |
|---|---|---|
| `sol2uml` | Visualizes storage layout as diagrams | No live state, no diffs, no migration |
| `hardhat-storage-layout` | Prints slot table from compiled artifacts | No live values, no diff, no migration |
| `slither-read-storage` | Reads raw storage slots from a live contract | No variable name mapping, no diff, no migration |
| `SmartMuv` | Extracts storage state for migration | No semantic diff, no verification, no script generation |
| Tenderly | Monitors live contract state | No upgrade diffs, no migration tooling |
| OpenZeppelin Upgrades | Validates upgrade compatibility | Layout collision check only, no live state diff |

**SlotProbe v1 is the first tool to deliver this complete workflow in a single CLI:**

```
snapshot → semantic diff → storage collision check → migration script → auto-verification on fork
```

---

## ✅ What SlotProbe v1 Does

```bash
# Dry-run a snapshot to see what it would read before committing
SlotProbe snapshot 0xUniswapV3Pool --chain mainnet --dry-run
# Output: "Would read 23 variables across 31 RPC calls"

# Take a snapshot of specific variables before an upgrade
SlotProbe snapshot 0xUniswapV3Pool \
  --chain mainnet \
  --block 19000000 \
  --only fee,tickSpacing,owner,liquidity \
  --out before.json

# Take a snapshot after the upgrade
SlotProbe snapshot 0xUniswapV3Pool \
  --chain mainnet \
  --block 19001000 \
  --only fee,tickSpacing,owner,liquidity \
  --out after.json

# Diff the two snapshots by variable name — not by raw slot
SlotProbe diff before.json after.json

# Diff with machine-readable output for CI scripts
SlotProbe diff before.json after.json --output json

# Diff with Markdown output ready to paste into a PR description
SlotProbe diff before.json after.json --output markdown

# Check if your new implementation would cause a storage collision
SlotProbe check-collision ./artifacts/OldContract.json ./artifacts/NewContract.json

# Generate a migration script and automatically verify it on an Anvil fork
SlotProbe generate-migration before.json after.json \
  --format foundry \
  --verify \
  --artifact ./out/UniswapV3Pool.sol/UniswapV3Pool.json \
  --out migrate.s.sol

# Dry-run a migration to see what it would change without executing
SlotProbe generate-migration before.json after.json --dry-run
# Output: "Would update fee from 3000 → 5000, owner from 0xDead → 0xAlice"
```

---

## 🎯 v1 Scope — What's In, What's Out

This is a focused v1. Scope discipline is what makes a first release actually ship.

### ✅ In Scope for v1

| Feature | Why |
|---|---|
| EVM storage engine (slot reading + decoding) | The core foundation everything depends on |
| Artifact parser for Foundry + Hardhat | Must support both major dev frameworks |
| Semantic snapshot capture | The primary user-facing value |
| `--only` flag to snapshot specific variables | Critical for large contracts with mappings |
| `--dry-run` on every command | Builds user trust, prevents accidents |
| Semantic diff engine | Core workflow step |
| Terminal, JSON, and Markdown output | CI integration requires machine-readable output |
| Storage collision detector | Directly prevents millions in losses |
| Migration script generator (Foundry + Hardhat) | Closes the workflow loop |
| `--verify` flag on migration generation | Auto-tests on Anvil fork before you ship |
| Basic mapping support via `--mapping-keys` file | Practical necessity for real contracts |
| RPC batching + retry + rate limit config | Without this, public RPC users hit walls immediately |
| GitHub Actions workflow file | Drives adoption through CI integration |

### ❌ Out of Scope for v1

| Feature | Why Deferred |
|---|---|
| AI migration suggestions | Too speculative — wrong suggestions on production migrations are dangerous |
| VS Code extension | Scope creep with unclear v1 value |
| Snapshot timeline viewer | Nice-to-have, not core workflow |
| Cross-chain consistency checker | Strong v2 feature once the core is proven |
| Full mapping enumeration | Complex, edge-case-heavy; basic key-file approach covers 80% of real use cases |
| Etherscan auto-fetch | Convenient but not essential for v1 |

---

## ⚡ Key Features

### 1. Semantic State Snapshots
SlotProbe reads raw EVM storage slots via `eth_getStorageAt` and maps them back to **named Solidity variables** using the compiler's `storageLayout` output. Instead of seeing `slot 3 = 0x000...0001`, you see `_owner = 0xab12...`.

Supports in v1:
- Simple types (uint, int, address, bool, bytes32)
- Packed slots (multiple variables packed into one 32-byte slot)
- Dynamic arrays (reads length + all elements)
- Basic mapping support via user-supplied key files
- All major proxy patterns (EIP-1967, Transparent, UUPS)

### 2. `--only` Flag for Targeted Snapshots
For contracts with large mappings or many variables, a full snapshot is slow and expensive on RPC calls. The `--only` flag lets you snapshot exactly the variables you care about:

```bash
SlotProbe snapshot 0x... --only fee,tickSpacing,owner
```

### 3. `--dry-run` Mode Everywhere
Every command that reads state or writes files supports `--dry-run`. This is critical for building user trust and preventing accidents in CI pipelines.

```bash
SlotProbe snapshot 0x... --dry-run
# Would read 23 variables across 31 RPC calls on mainnet at block 19042311

SlotProbe diff before.json after.json --dry-run
# Would compare before.json and after.json and print the summary without emitting the full diff

SlotProbe check-collision old.json new.json --dry-run
# Would parse both artifacts and preview the collision check plan

SlotProbe generate-migration before.json after.json --dry-run
# Would generate migration script with 3 state changes:
#   fee: 3000 → 5000
#   tickSpacing: 60 → 10
#   owner: 0xDead...Beef → 0xAlice...1234
# No files written (--dry-run)
```

### 4. Human-Readable Diff Engine
Like `git diff`, but for contract storage. SlotProbe diffs two snapshots and outputs:

```diff
Contract: UniswapV3Pool (0xabc...123)
Snapshot A: block 19000000 (mainnet)
Snapshot B: block 19001000 (mainnet)

  fee: 3000 (unchanged)
- tickSpacing: 60
+ tickSpacing: 10
- owner: 0xDead...Beef
+ owner: 0xAlice...1234
  liquidity: 4823947239847 (unchanged)

Summary: 2 changed, 2 unchanged, 0 added, 0 removed
```

### 5. Multiple Output Formats
```bash
# Human-readable terminal output (default)
SlotProbe diff before.json after.json

# JSON for scripting and CI
SlotProbe diff before.json after.json --output json

# Markdown for pasting into GitHub PR descriptions
SlotProbe diff before.json after.json --output markdown
```

The Markdown output is formatted to paste directly into a PR description as a storage change audit table.

### 6. Storage Collision Detector
Compares two contract versions' compiled storage layouts and flags any slot conflicts **before** deployment. Handles packed slots and inheritance chains.

```bash
SlotProbe check-collision ./artifacts/OldContract.json ./artifacts/NewContract.json

# Output:
# ✅ No collisions detected between OldContract and NewContract
# Checked 14 storage variables across 9 slots

# Or:
# ❌ COLLISION DETECTED
# Slot 3 conflict:
#   OldContract: _owner (address, bytes 0-19)
#   NewContract: _fee (uint128, bytes 0-15)
# This upgrade WILL corrupt _owner on mainnet. Do not proceed.
```

### 7. Migration Script Generator with `--verify`
Generates a ready-to-run Foundry or Hardhat script from a diff, then automatically verifies it on an Anvil fork:

```bash
SlotProbe generate-migration before.json after.json \
  --format foundry \
  --verify \
  --artifact ./out/UniswapV3Pool.sol/UniswapV3Pool.json \
  --out migrate.s.sol
```

When `--verify` is passed, SlotProbe:
1. Generates the migration script
2. Spins up an Anvil fork at the before-snapshot block
3. Runs the migration script against the fork
4. Re-captures the pre-migration fork state and confirms it matches `before.json`
5. Takes a post-migration snapshot
6. Diffs it against `after.json`
7. Passes if they match — fails with a detailed mismatch summary if they don't

```
✅ Migration verified on Anvil fork
   Pre-migration state matched before.json (4/4 variables)
   Post-migration state matched after.json (4/4 variables)
   Script written to: migrate.s.sol
```

### 8. RPC Batching and Retry
Public RPC providers rate-limit aggressively. SlotProbe batches slot reads and respects configurable concurrency limits, retries, and backoff settings so your workflows don't randomly fail.

```json
{
  "rpcConfig": {
    "maxConcurrent": 5,
    "retries": 3,
    "backoffMs": 1000
  }
}
```

### 9. Basic Mapping Support
Full mapping enumeration (reading every key in a mapping) is a future feature — it requires off-chain indexing data that SlotProbe does not yet have. For v1, you supply a keys file:

```bash
SlotProbe snapshot 0x... --mapping-keys positions.json
```

Where `positions.json` maps each mapping path to the keys you care about:
```json
{
  "positions": ["0xabc...123", "0xdef...456", "0x789...abc"]
}
```

For nested mappings, use the expanded parent path as the JSON key:
```json
{
  "balances": ["0xOuter1", "0xOuter2"],
  "balances[0xOuter1]": ["0xInner1", "0xInner2"],
  "balances[0xOuter2]": ["0xInner3"]
}
```

For `mapping(address => mapping(address => uint256)) balances`, SlotProbe first expands `balances`, then uses entries like `balances[0xOuter1]` to discover the inner mapping keys. Full enumeration is on the v2 roadmap.

---

## 🏗 How It Works (Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                    SlotProbe CLI                         │
│   snapshot | diff | check-collision | generate-migration │
│         --dry-run | --only | --output | --verify         │
└─────────────────────────┬───────────────────────────────┘
                          │
          ┌───────────────┼──────────────┐
          ▼               ▼              ▼
┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐
│  Artifact        │ │  EVM Storage │ │  RPC Manager     │
│  Parser          │ │  Engine      │ │                  │
│                  │ │              │ │  Batching        │
│  Foundry JSON    │ │  Slot reader │ │  Retry + backoff │
│  Hardhat JSON    │ │  Slot math   │ │  Rate limiting   │
│  storageLayout   │ │  Type decode │ │  viem clients    │
└────────┬─────────┘ └──────┬───────┘ └────────┬─────────┘
         │                  │                  │
         └──────────────────▼──────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Snapshot Store  │
                   │  (JSON files)    │
                   └────────┬─────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
   ┌──────────────┐ ┌───────────────┐ ┌──────────────────┐
   │ Diff Engine  │ │   Collision   │ │  Migration       │
   │              │ │   Detector    │ │  Generator       │
   │  Semantic    │ │               │ │                  │
   │  variable-   │ │  Slot overlap │ │  Handlebars      │
   │  level diff  │ │  checker      │ │  templates       │
   │              │ │               │ │  + Anvil verify  │
   └──────┬───────┘ └───────┬───────┘ └────────┬─────────┘
          │                 │                  │
          └─────────────────▼──────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Output Layer    │
                   │                  │
                   │  Terminal        │
                   │  JSON            │
                   │  Markdown        │
                   └──────────────────┘
```

---

## 🛠 Tech Stack

### Core Language
**TypeScript 5.x** — The entire Web3 tooling ecosystem lives here. Type safety will save you significant debugging time when working with complex EVM data types and bigint arithmetic.

### Blockchain Interaction
| Package | Version | Purpose |
|---|---|---|
| `viem` | `^2.x` | Primary RPC client. Type-safe, modern, fast. Used for all `eth_getStorageAt` calls and chain configuration |
| `ethers` | `^6.x` | Secondary compatibility layer — some Hardhat tooling still expects ethers types |

### EVM & Solidity
| Tool | Purpose |
|---|---|
| `solc` compiler `storageLayout` output | Maps each variable to its exact slot and offset. This is your foundation — without this you're working with raw hex |
| Foundry build artifacts | `out/ContractName.sol/ContractName.json` — ABI + full storage layout in one file |
| Hardhat artifacts | `artifacts/contracts/...` — slightly different JSON format, same underlying data |

### CLI Framework
| Package | Purpose |
|---|---|
| `commander` | Subcommand routing and flag parsing |
| `ora` | Terminal spinners while waiting for RPC responses |
| `chalk` | Colored diff output (red = removed, green = added, dim = unchanged) |
| `cli-table3` | Tabular terminal output for storage layout and diff reports |
| `inquirer` | Interactive prompts when required config is missing |

### Data & Config
| Package | Purpose |
|---|---|
| `zod` | Runtime validation for `.SlotProberc.json` config and snapshot files |
| `handlebars` | Template engine for generating Foundry and Hardhat migration scripts |
| `p-limit` | Concurrency control for RPC batching |
| `p-retry` | Retry logic with configurable backoff |

### Testing
| Tool | Purpose |
|---|---|
| `vitest` | Fast, TypeScript-native test runner |
| `anvil` (ships with Foundry) | Local EVM fork for integration tests — fork mainnet at a specific block |

### Build & Distribution
| Tool | Purpose |
|---|---|
| `tsup` | Bundles your library for programmatic use (`import { snapshot } from 'SlotProbe'`) |
| `tsx` | Run TypeScript directly during development without a build step |
| `changesets` | Version management and changelog generation |

---

## 📚 Skills You Need to Build This

This is an honest breakdown of every skill required, what level you need, and exactly where to learn it. Nothing is assumed.

---

### 1. TypeScript — Intermediate

You need to be past the basics. Generics, type guards, discriminated unions, and async patterns are used throughout. You do not need to be an expert, but you will struggle if you are still learning the fundamentals.

**Where to learn:**
- [The TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) — official, free, comprehensive. Work through the entire thing.
- [Total TypeScript Free Tutorials](https://www.totaltypescript.com/tutorials) — Matt Pocock's free beginner series. Video-based and very practical.
- [Execute Program — TypeScript](https://www.executeprogram.com/courses/typescript) — browser-based interactive exercises. Paid, but highly effective for ingraining the type system.

**What to focus on specifically:** Generics, `unknown` vs `any`, discriminated unions, handling `bigint` (you will use bigint constantly for slot arithmetic), async/await with `Promise.all`, and `zod` for runtime validation.

---

### 2. EVM Storage Layout — Intermediate (This Is the Hard Core Skill)

This is the most important and most difficult thing to learn for this project. You need to deeply understand how Solidity packs variables into 32-byte slots, how mappings and dynamic arrays compute their slot positions using keccak256, how the Solidity compiler exposes this via the `storageLayout` JSON field, and what packed storage means.

**Where to learn:**
- [Solidity Docs — Layout of State Variables in Storage](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html) — read this repeatedly until every section makes sense. This is the spec you are implementing.
- [Trail of Bits — Shedding Smart Contract Storage with Slither](https://blog.trailofbits.com/2022/07/28/shedding-smart-contract-storage-with-slither/) — practical walkthrough of the same concepts with real examples.
- [Noxx EVM Deep Dives](https://noxx.substack.com/) — some of the best EVM internals writing available, free. Specifically read the storage layout posts.
- [EVM Codes](https://www.evm.codes/) — reference for SLOAD and SSTORE opcodes.
- [RareSkills — EVM Storage](https://www.rareskills.io/post/evm-solidity-storage-layout) — free article, very clear diagrams.

**What to practice:** Open a verified contract on Etherscan. Manually calculate what slot `balances[0xabc...]` lives at using the keccak256 formula. Then verify your answer with `cast storage` from Foundry. Do this for mappings, for dynamic arrays, and for a struct. Repeat until it feels mechanical.

---

### 3. Foundry — Beginner to Intermediate

Foundry is the modern smart contract development framework. You will use Anvil (its local EVM node) for integration tests and the `--verify` feature. You also need to understand its artifact format to parse `storageLayout` from build output. You do not need to write Solidity in Foundry — you need to use its tools.

**Where to learn:**
- [Foundry Book](https://book.getfoundry.sh/) — the official documentation. Free and comprehensive. Work through the Getting Started section and the Anvil reference.
- [Patrick Collins — Learn Foundry Full Course](https://www.youtube.com/watch?v=umepbfKp5rI) — free YouTube course, beginner-friendly, covers everything you need.

**What to practice:** Run `forge build` on any project and open the `out/` folder. Inspect the JSON file for a contract — find the `storageLayout` key. Run `anvil --fork-url <mainnet-rpc>` and use `cast storage <address> <slot>` to manually read a slot. This is exactly what your tool will automate.

---

### 4. Viem — Beginner

Viem is your primary RPC client library. It is well-documented and you will pick it up quickly if your TypeScript is solid.

**Where to learn:**
- [Viem Getting Started](https://viem.sh/docs/getting-started) — start here, takes about an hour.
- [Viem — `getStorageAt` reference](https://viem.sh/docs/actions/public/getStorageAt) — read this API reference carefully, as it is the core RPC call your tool makes.

**What to practice:** Write a small script that creates a viem client, calls `getStorageAt` on a real contract address at a specific block, and logs the result. This is the foundation of your entire storage engine.

---

### 5. Node.js CLI Development — Beginner

Building a polished CLI requires understanding argument parsing, process exit codes, stderr vs stdout, and npm package distribution. This is more involved than building a library.

**Where to learn:**
- [Commander.js README](https://github.com/tj/commander.js) — the README itself teaches you almost everything you need. Read it fully.
- [Ora README](https://github.com/sindresorhus/ora) — spinners for async operations. Simple API.
- [Chalk README](https://github.com/chalk/chalk) — terminal color. Very simple.
- [npm — Publishing Packages](https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages) — for when you are ready to publish as `SlotProbe` on npm.

**What to practice:** Build a small throwaway CLI that takes a contract address as an argument, validates it with zod, prints a spinner while making a fake async call, then outputs colored text. This warms up the CLI layer before you wire in the real logic.

---

### 6. Solidity — Beginner (Reading Only, Not Writing)

You do not need to write Solidity. You need to read it fluently enough to understand proxy patterns, storage layout implications of inheritance, and how upgradeable contracts work.

**Where to learn:**
- [Solidity by Example](https://solidity-by-example.org/) — short, practical snippets covering every concept. Free. Focus on: inheritance, interfaces, mappings, and the upgradeable proxy section.
- [CryptoZombies](https://cryptozombies.io/) — gamified, beginner-friendly introduction if you have never read Solidity before.
- [OpenZeppelin Upgrades Plugin Docs](https://docs.openzeppelin.com/upgrades-plugins/1.x/) — read the proxy pattern explanation section specifically.

---

### 7. Proxy Patterns — Intermediate

This is non-negotiable. Your collision detector needs to understand EIP-1967, Transparent Proxy, and UUPS because each has different storage slot conventions and different collision risks.

**Where to learn:**
- [OpenZeppelin — Proxy Upgrade Pattern](https://docs.openzeppelin.com/contracts/4.x/api/proxy) — official documentation with diagrams.
- [EIP-1967](https://eips.ethereum.org/EIPS/eip-1967) — the actual standard. Read it. It is short.
- [RareSkills — Proxy Patterns Deep Dive](https://www.rareskills.io/post/proxy-patterns) — free, the clearest explanation of all proxy patterns with diagrams and code. Read this before touching the collision detector.

---

### 8. Handlebars Templates — Beginner

Used for generating Foundry and Hardhat migration scripts. Simple and fast to learn.

**Where to learn:**
- [Handlebars.js Official Guide](https://handlebarsjs.com/guide/) — work through the guide in one sitting. The API surface you need is small.

---

### 9. Testing with Vitest and Anvil — Beginner

Your integration tests fork mainnet using Anvil, then run your tool against real contracts with known state. This is more powerful than mocking and catches real-world edge cases.

**Where to learn:**
- [Vitest Getting Started](https://vitest.dev/guide/) — official guide. Clear and concise. You will feel at home if you have used Jest before.
- [Foundry Book — Anvil](https://book.getfoundry.sh/reference/anvil/) — specifically the `--fork-url` and `--fork-block-number` flags. These let you replay history deterministically.

---

## 📁 Project Structure

```
SlotProbe/
├── src/
│   ├── cli/
│   │   ├── index.ts                   # Entry point, Commander setup
│   │   ├── commands/
│   │   │   ├── snapshot.ts            # SlotProbe snapshot
│   │   │   ├── diff.ts                # SlotProbe diff
│   │   │   ├── check-collision.ts     # SlotProbe check-collision
│   │   │   └── generate-migration.ts  # SlotProbe generate-migration
│   │   └── formatters/
│   │       ├── terminal.ts            # Chalk + cli-table3 output (default)
│   │       ├── json.ts                # JSON output (--output json)
│   │       └── markdown.ts            # Markdown output (--output markdown)
│   │
│   ├── core/
│   │   ├── storage-engine/
│   │   │   ├── reader.ts              # eth_getStorageAt wrapper
│   │   │   ├── slot-calculator.ts     # keccak256 slot math for mappings/arrays
│   │   │   ├── decoder.ts             # Raw hex → typed Solidity value
│   │   │   └── packed.ts              # Packed slot handling (multiple vars per slot)
│   │   │
│   │   ├── artifact-parser/
│   │   │   ├── foundry.ts             # Parse Foundry out/ JSON artifacts
│   │   │   ├── hardhat.ts             # Parse Hardhat artifacts/
│   │   │   ├── normalizer.ts          # Normalize both formats to shared schema
│   │   │   └── types.ts               # StorageLayout, StorageVariable, TypeInfo
│   │   │
│   │   ├── snapshot/
│   │   │   ├── capture.ts             # Orchestrates a full snapshot
│   │   │   ├── filter.ts              # --only flag filtering logic
│   │   │   ├── mapping-keys.ts        # Basic mapping support from keys file
│   │   │   ├── store.ts               # Read/write snapshot JSON (bigint-safe)
│   │   │   └── types.ts               # Snapshot schema
│   │   │
│   │   ├── diff/
│   │   │   ├── engine.ts              # Core diff logic
│   │   │   ├── semantic.ts            # Variable-level diff (not raw slots)
│   │   │   └── types.ts               # DiffEntry, DiffStatus
│   │   │
│   │   ├── collision/
│   │   │   ├── detector.ts            # Storage slot collision detection
│   │   │   ├── proxy-handler.ts       # Proxy-pattern-aware collision logic
│   │   │   └── report.ts              # Collision report formatting
│   │   │
│   │   └── migration/
│   │       ├── generator.ts           # Generates script from diffs
│   │       ├── verifier.ts            # Anvil fork verification logic
│   │       └── templates/
│   │           ├── foundry.hbs        # Foundry script template
│   │           └── hardhat.hbs        # Hardhat script template
│   │
│   ├── rpc/
│   │   ├── client.ts                  # viem client factory per chain
│   │   ├── chains.ts                  # Chain configs
│   │   ├── batch.ts                   # p-limit concurrency batching
│   │   └── retry.ts                   # p-retry with exponential backoff
│   │
│   └── config/
│       ├── loader.ts                  # Load and merge .SlotProberc.json
│       └── schema.ts                  # zod config schema
│
├── test/
│   ├── unit/
│   │   ├── slot-calculator.test.ts
│   │   ├── decoder.test.ts
│   │   ├── artifact-parser.test.ts
│   │   └── diff-engine.test.ts
│   └── integration/
│       ├── snapshot.test.ts           # Mainnet fork, real contracts
│       ├── diff.test.ts
│       ├── collision.test.ts
│       └── migration-verify.test.ts   # Full --verify flow on Anvil
│
├── templates/
│   ├── foundry.hbs
│   └── hardhat.hbs
│
├── .SlotProberc.example.json
├── .github/
│   └── workflows/
│       └── SlotProbe-check.yml        # Ready-made GitHub Actions workflow
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🪜 Step-by-Step Build Guide

Follow these phases in order. Each phase ends with a testable milestone before you move on.

---

### Phase 1 — EVM Storage Engine

**Goal:** Given a contract address, chain, and slot number, return a decoded typed value.

**Step 1.1 — Project setup**

```bash
mkdir SlotProbe && cd SlotProbe
npm init -y
npm install -D typescript @types/node tsx vitest tsup
npm install viem zod chalk ora commander cli-table3 handlebars p-limit p-retry
npx tsc --init
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "resolveJsonModule": true
  }
}
```

**Step 1.2 — RPC client factory**

```typescript
// src/rpc/client.ts
import { createPublicClient, http } from 'viem'
import { mainnet, arbitrum, base, optimism, polygon } from 'viem/chains'

const CHAINS = { mainnet, arbitrum, base, optimism, polygon } as const
export type SupportedChain = keyof typeof CHAINS

export function getClient(chain: SupportedChain, rpcUrl?: string) {
  return createPublicClient({
    chain: CHAINS[chain],
    transport: http(rpcUrl ?? CHAINS[chain].rpcUrls.default.http[0])
  })
}
```

**Step 1.3 — RPC batching with concurrency and retry**

```typescript
// src/rpc/batch.ts
import pLimit from 'p-limit'
import pRetry from 'p-retry'

export interface RpcConfig {
  maxConcurrent: number
  retries: number
  backoffMs: number
}

export function createBatchedReader(config: RpcConfig) {
  const limit = pLimit(config.maxConcurrent)

  return async function batchRead<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    return Promise.all(
      tasks.map(task =>
        limit(() =>
          pRetry(task, {
            retries: config.retries,
            minTimeout: config.backoffMs
          })
        )
      )
    )
  }
}
```

**Step 1.4 — Raw slot reader**

```typescript
// src/core/storage-engine/reader.ts
import { getClient, type SupportedChain } from '../../rpc/client'

export async function readSlot(
  address: `0x${string}`,
  slot: bigint,
  chain: SupportedChain,
  blockNumber?: bigint,
  rpcUrl?: string
): Promise<`0x${string}`> {
  const client = getClient(chain, rpcUrl)
  const result = await client.getStorageAt({
    address,
    slot: `0x${slot.toString(16).padStart(64, '0')}` as `0x${string}`,
    blockNumber
  })
  return result ?? '0x0000000000000000000000000000000000000000000000000000000000000000'
}
```

**Step 1.5 — Slot calculator (the hard part — study the Solidity storage docs first)**

```typescript
// src/core/storage-engine/slot-calculator.ts
import { keccak256, encodePacked, pad, toHex } from 'viem'

// Mapping slot: keccak256(abi.encode(key, baseSlot))
// Used for: mapping(address => uint), mapping(bytes32 => struct), etc.
export function mappingSlot(key: `0x${string}`, baseSlot: bigint): bigint {
  const paddedKey = pad(key, { size: 32 })
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const encoded = `0x${paddedKey.slice(2)}${paddedSlot.slice(2)}` as `0x${string}`
  return BigInt(keccak256(encoded))
}

// Dynamic array element slot: keccak256(baseSlot) + index
// The length of the array is stored at baseSlot itself
export function arrayElementSlot(baseSlot: bigint, index: bigint): bigint {
  const paddedSlot = pad(toHex(baseSlot), { size: 32 })
  const base = BigInt(keccak256(paddedSlot))
  return base + index
}

// Nested mapping slot: apply mappingSlot recursively for each key depth
export function nestedMappingSlot(keys: `0x${string}`[], baseSlot: bigint): bigint {
  return keys.reduce((slot, key) => mappingSlot(key, slot), baseSlot)
}
```

**Step 1.6 — Type decoder**

```typescript
// src/core/storage-engine/decoder.ts
export function decodeValue(rawHex: string, solidityType: string): unknown {
  const padded = rawHex.replace('0x', '').padStart(64, '0')
  const value = BigInt(`0x${padded}`)

  if (solidityType === 'bool') return value !== 0n

  if (solidityType.startsWith('uint')) return value.toString()

  if (solidityType.startsWith('int')) {
    const bits = parseInt(solidityType.replace('int', '') || '256')
    const threshold = 2n ** BigInt(bits - 1)
    return (value >= threshold ? value - 2n ** BigInt(bits) : value).toString()
  }

  if (solidityType === 'address') {
    return `0x${padded.slice(-40)}`
  }

  if (solidityType.startsWith('bytes') && !solidityType.includes('[')) {
    // Fixed bytes (bytes1 to bytes32) — left-aligned in the slot
    return `0x${padded}`
  }

  // Fallback for complex/unrecognized types
  return `0x${padded}`
}
```

**Step 1.7 — Packed slot handling**

When multiple small variables share a single 32-byte slot, you need to extract each by its byte offset and size:

```typescript
// src/core/storage-engine/packed.ts
export function extractPackedValue(
  rawSlot: string,
  byteOffset: number,
  numberOfBytes: number
): string {
  // rawSlot is a 64-char hex string (32 bytes)
  // EVM stores in big-endian, packed vars are right-aligned
  const hex = rawSlot.replace('0x', '').padStart(64, '0')

  // Packed variables are stored from the right (low bytes) of the slot
  const startByte = 32 - byteOffset - numberOfBytes
  const startChar = startByte * 2
  const endChar = startChar + numberOfBytes * 2

  return `0x${hex.slice(startChar, endChar).padStart(64, '0')}`
}
```

**Milestone check:** Write a unit test that manually reads slot 0 of the USDC contract on a mainnet Anvil fork and verifies the decoded value matches the known `totalSupply`. Run it with `npx vitest run`.

---

### Phase 2 — Artifact Parser

**Goal:** Given a Foundry or Hardhat build artifact file, return a normalized `StorageLayout` object that maps every variable to its name, type, slot, offset, and size.

**Step 2.1 — Define the shared schema**

```typescript
// src/core/artifact-parser/types.ts
import { z } from 'zod'

export const StorageVariableSchema = z.object({
  name: z.string(),
  type: z.string(),       // solc internal type string e.g. "t_uint256"
  label: z.string(),      // human-readable Solidity type e.g. "uint256"
  slot: z.bigint(),
  offset: z.number(),     // byte offset within the slot (0 for most vars)
  numberOfBytes: z.number()
})

export const TypeInfoSchema = z.object({
  encoding: z.enum(['inplace', 'mapping', 'dynamic_array', 'bytes']),
  numberOfBytes: z.number(),
  label: z.string(),
  members: z.array(StorageVariableSchema).optional(),  // for structs
  key: z.string().optional(),    // for mappings: the key type
  value: z.string().optional(),  // for mappings: the value type
  base: z.string().optional()    // for dynamic arrays: the element type
})

export const StorageLayoutSchema = z.object({
  contractName: z.string(),
  variables: z.array(StorageVariableSchema),
  types: z.record(TypeInfoSchema)
})

export type StorageVariable = z.infer<typeof StorageVariableSchema>
export type TypeInfo = z.infer<typeof TypeInfoSchema>
export type StorageLayout = z.infer<typeof StorageLayoutSchema>
```

**Step 2.2 — Foundry artifact parser**

Foundry stores the storage layout at `artifact.storageLayout`. Enable it in `foundry.toml`:
```toml
[profile.default]
extra_output = ["storageLayout"]
```

```typescript
// src/core/artifact-parser/foundry.ts
import { readFileSync } from 'fs'
import { StorageLayoutSchema, type StorageLayout } from './types'

export function parseFoundryArtifact(artifactPath: string): StorageLayout {
  const raw = JSON.parse(readFileSync(artifactPath, 'utf-8'))

  if (!raw.storageLayout) {
    throw new Error(
      `No storageLayout found in ${artifactPath}.\n` +
      `Add this to your foundry.toml:\n` +
      `  [profile.default]\n` +
      `  extra_output = ["storageLayout"]`
    )
  }

  const layout = raw.storageLayout

  return StorageLayoutSchema.parse({
    contractName: artifactPath.split('/').pop()?.replace('.json', '') ?? 'Unknown',
    variables: layout.storage.map((v: any) => ({
      name: v.label,
      type: v.type,
      label: layout.types[v.type]?.label ?? v.type,
      slot: BigInt(v.slot),
      offset: Number(v.offset),
      numberOfBytes: Number(layout.types[v.type]?.numberOfBytes ?? 32)
    })),
    types: Object.fromEntries(
      Object.entries(layout.types).map(([k, v]: [string, any]) => [k, {
        encoding: v.encoding,
        numberOfBytes: Number(v.numberOfBytes),
        label: v.label,
        members: v.members?.map((m: any) => ({
          name: m.label,
          type: m.type,
          label: layout.types[m.type]?.label ?? m.type,
          slot: BigInt(m.slot),
          offset: Number(m.offset),
          numberOfBytes: Number(layout.types[m.type]?.numberOfBytes ?? 32)
        })),
        key: v.key,
        value: v.value,
        base: v.base
      }])
    )
  })
}
```

**Step 2.3 — Hardhat artifact parser**

Hardhat requires enabling storage layout output in `hardhat.config.ts`:
```typescript
// Tell users to add this to their hardhat.config.ts:
// solidity: {
//   settings: { outputSelection: { "*": { "*": ["storageLayout"] } } }
// }
```

The parsing logic is similar to Foundry but the JSON structure differs slightly. The storage layout is nested under `artifact.storageLayout` in newer Hardhat versions.

**Step 2.4 — Normalizer**

```typescript
// src/core/artifact-parser/normalizer.ts
import { parseFoundryArtifact } from './foundry'
import { parseHardhatArtifact } from './hardhat'

export function parseArtifact(artifactPath: string) {
  // Detect format by examining the JSON structure
  const raw = JSON.parse(require('fs').readFileSync(artifactPath, 'utf-8'))
  const isFoundry = 'abi' in raw && 'bytecode' in raw && typeof raw.bytecode === 'object'
  return isFoundry ? parseFoundryArtifact(artifactPath) : parseHardhatArtifact(artifactPath)
}
```

**Milestone check:** Point the parser at the build artifact of any local Foundry project and console.log the resulting `StorageLayout`. Every variable should have a name, correct slot number, and correct byte count.

---

### Phase 3 — Snapshot System

**Goal:** Combine the storage engine and artifact parser to read and persist a full semantic snapshot of a live contract's state.

**Step 3.1 — Snapshot types**

```typescript
// src/core/snapshot/types.ts
import { z } from 'zod'

export const SnapshotEntrySchema = z.object({
  name: z.string(),
  solidityType: z.string(),
  slot: z.string(),          // Stored as string (bigint-safe JSON)
  offset: z.number(),
  rawValue: z.string(),
  decodedValue: z.unknown()
})

export const SnapshotSchema = z.object({
  schemaVersion: z.literal('1'),
  address: z.string(),
  chain: z.string(),
  blockNumber: z.string(),   // String for bigint-safe serialization
  capturedAt: z.number(),
  contractName: z.string(),
  variables: z.array(SnapshotEntrySchema)
})

export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>
export type Snapshot = z.infer<typeof SnapshotSchema>
```

**Step 3.2 — Filter logic for `--only`**

```typescript
// src/core/snapshot/filter.ts
import type { StorageLayout } from '../artifact-parser/types'

export function applyOnlyFilter(
  layout: StorageLayout,
  only?: string[]
): StorageLayout {
  if (!only || only.length === 0) return layout

  const filtered = layout.variables.filter(v => only.includes(v.name))
  const missing = only.filter(name => !layout.variables.find(v => v.name === name))

  if (missing.length > 0) {
    throw new Error(
      `Variables not found in contract storage layout: ${missing.join(', ')}\n` +
      `Available variables: ${layout.variables.map(v => v.name).join(', ')}`
    )
  }

  return { ...layout, variables: filtered }
}
```

**Step 3.3 — Mapping key file support**

```typescript
// src/core/snapshot/mapping-keys.ts
// positions.json format:
// {
//   "variableName": ["0xkey1", "0xkey2"],
//   "variableName[0xkey1]": ["0xnestedKey1"]
// }
import { readFileSync } from 'fs'
import { mappingSlot } from '../storage-engine/slot-calculator'

export function loadMappingKeys(filePath: string): Record<string, `0x${string}`[]> {
  return JSON.parse(readFileSync(filePath, 'utf-8'))
}
```

Top-level mappings use the Solidity variable name. Nested mappings use the full expanded path of their parent entry because the nested mapping itself has no standalone Solidity name.

**Step 3.4 — Dry-run mode for snapshot**

```typescript
// src/core/snapshot/capture.ts (dry-run portion)
export function dryRunSnapshot(layout: StorageLayout, address: string, chain: string): void {
  const slotCount = layout.variables.reduce((acc, v) => {
    // Estimate RPC calls needed (mappings multiply by number of keys)
    return acc + 1
  }, 0)

  console.log(`Would read ${layout.variables.length} variables`)
  console.log(`Estimated RPC calls: ${slotCount}`)
  console.log(`Contract: ${address} on ${chain}`)
  console.log(`No reads performed (--dry-run)`)
}
```

**Step 3.5 — BigInt-safe serialization**

`JSON.stringify` cannot serialize `bigint`. Use a custom replacer/reviver pair throughout the entire codebase.

```typescript
// src/core/snapshot/store.ts
import { writeFileSync, readFileSync } from 'fs'
import type { Snapshot } from './types'

const BIGINT_MARKER = '__bigint__'

export function saveSnapshot(snapshot: Snapshot, path: string): void {
  const json = JSON.stringify(snapshot, (_, v) =>
    typeof v === 'bigint' ? `${BIGINT_MARKER}${v.toString()}` : v, 2)
  writeFileSync(path, json, 'utf-8')
}

export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(
    readFileSync(path, 'utf-8'),
    (_, v) => typeof v === 'string' && v.startsWith(BIGINT_MARKER)
      ? BigInt(v.slice(BIGINT_MARKER.length))
      : v
  )
  return raw
}
```

**Milestone check:** Run `SlotProbe snapshot 0xUniswapV3Pool --chain mainnet --only fee,tickSpacing --out before.json` against an Anvil mainnet fork. Inspect `before.json` — you should see named variables with decoded human-readable values, not raw hex.

---

### Phase 4 — Diff Engine

**Goal:** Given two snapshot files, produce a semantic diff at the variable name level with support for terminal, JSON, and Markdown output.

**Step 4.1 — Diff types**

```typescript
// src/core/diff/types.ts
export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DiffEntry {
  name: string
  solidityType: string
  status: DiffStatus
  before?: unknown
  after?: unknown
}

export interface DiffResult {
  contractName: string
  addressA: string
  addressB: string
  chainA: string
  chainB: string
  blockA: string
  blockB: string
  entries: DiffEntry[]
  summary: {
    changed: number
    added: number
    removed: number
    unchanged: number
  }
}
```

**Step 4.2 — Diff engine**

```typescript
// src/core/diff/engine.ts
import type { Snapshot } from '../snapshot/types'
import type { DiffEntry, DiffResult } from './types'

export function diffSnapshots(before: Snapshot, after: Snapshot): DiffResult {
  const entries: DiffEntry[] = []
  const afterMap = new Map(after.variables.map(e => [e.name, e]))
  const beforeMap = new Map(before.variables.map(e => [e.name, e]))

  // Check all before variables
  for (const entry of before.variables) {
    const afterEntry = afterMap.get(entry.name)
    if (!afterEntry) {
      entries.push({ name: entry.name, solidityType: entry.solidityType,
        status: 'removed', before: entry.decodedValue })
    } else if (JSON.stringify(entry.decodedValue) !== JSON.stringify(afterEntry.decodedValue)) {
      entries.push({ name: entry.name, solidityType: entry.solidityType,
        status: 'changed', before: entry.decodedValue, after: afterEntry.decodedValue })
    } else {
      entries.push({ name: entry.name, solidityType: entry.solidityType,
        status: 'unchanged', before: entry.decodedValue })
    }
  }

  // Find added variables (in after but not in before)
  for (const entry of after.variables) {
    if (!beforeMap.has(entry.name)) {
      entries.push({ name: entry.name, solidityType: entry.solidityType,
        status: 'added', after: entry.decodedValue })
    }
  }

  const summary = {
    changed: entries.filter(e => e.status === 'changed').length,
    added: entries.filter(e => e.status === 'added').length,
    removed: entries.filter(e => e.status === 'removed').length,
    unchanged: entries.filter(e => e.status === 'unchanged').length
  }

  return {
    contractName: before.contractName,
    addressA: before.address, addressB: after.address,
    chainA: before.chain, chainB: after.chain,
    blockA: before.blockNumber, blockB: after.blockNumber,
    entries, summary
  }
}
```

**Step 4.3 — Output formatters**

```typescript
// src/cli/formatters/terminal.ts
import chalk from 'chalk'
import type { DiffResult } from '../../core/diff/types'

export function formatDiffTerminal(diff: DiffResult): string {
  const lines: string[] = []
  lines.push(chalk.bold(`Contract: ${diff.contractName}`))
  lines.push(chalk.dim(`Block: ${diff.blockA} → ${diff.blockB}\n`))

  for (const entry of diff.entries) {
    if (entry.status === 'unchanged') {
      lines.push(chalk.dim(`  ${entry.name}: ${entry.before}`))
    } else if (entry.status === 'changed') {
      lines.push(chalk.red(`- ${entry.name}: ${entry.before}`))
      lines.push(chalk.green(`+ ${entry.name}: ${entry.after}`))
    } else if (entry.status === 'added') {
      lines.push(chalk.green(`+ ${entry.name}: ${entry.after} (new)`))
    } else if (entry.status === 'removed') {
      lines.push(chalk.red(`- ${entry.name}: ${entry.before} (removed)`))
    }
  }

  lines.push('')
  lines.push(chalk.bold(
    `Summary: ${diff.summary.changed} changed, ` +
    `${diff.summary.added} added, ` +
    `${diff.summary.removed} removed, ` +
    `${diff.summary.unchanged} unchanged`
  ))
  return lines.join('\n')
}
```

```typescript
// src/cli/formatters/markdown.ts
import type { DiffResult } from '../../core/diff/types'

export function formatDiffMarkdown(diff: DiffResult): string {
  const lines: string[] = [
    `## Storage Diff — ${diff.contractName}`,
    ``,
    `| Variable | Type | Before | After | Status |`,
    `|---|---|---|---|---|`
  ]

  for (const entry of diff.entries) {
    if (entry.status === 'unchanged') continue
    const status = entry.status === 'changed' ? '⚠️ Changed'
      : entry.status === 'added' ? '✅ Added'
      : '❌ Removed'
    lines.push(
      `| \`${entry.name}\` | \`${entry.solidityType}\` | ${entry.before ?? '—'} | ${entry.after ?? '—'} | ${status} |`
    )
  }

  lines.push(``)
  lines.push(`**${diff.summary.changed} changed · ${diff.summary.added} added · ${diff.summary.removed} removed**`)
  return lines.join('\n')
}
```

**Milestone check:** `SlotProbe diff before.json after.json` shows a colored terminal diff. `SlotProbe diff before.json after.json --output markdown` produces a table you could paste into a GitHub PR.

---

### Phase 5 — Migration Generator + Verify

**Goal:** Generate a Foundry or Hardhat migration script from a diff, and optionally auto-verify it against an Anvil fork.

**Step 5.1 — Foundry migration template**

```handlebars
{{! src/core/migration/templates/foundry.hbs }}
// SPDX-License-Identifier: MIT
// Generated by SlotProbe — https://github.com/your-username/SlotProbe
// DO NOT EDIT — regenerate with: SlotProbe generate-migration before.json after.json
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

interface I{{contractName}} {
{{#each changes}}
    function set{{capitalize name}}({{solidityType}} value) external;
{{/each}}
}

contract Migrate{{contractName}} is Script {
    address constant CONTRACT = {{address}};

    function run() external {
        vm.startBroadcast();
        I{{contractName}} c = I{{contractName}}(CONTRACT);

        {{#each changes}}
        // {{name}}: {{before}} → {{after}}
        c.set{{capitalize name}}({{after}});
        {{/each}}

        vm.stopBroadcast();
    }
}
```

**Step 5.2 — Generator**

```typescript
// src/core/migration/generator.ts
import Handlebars from 'handlebars'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { DiffEntry } from '../diff/types'

Handlebars.registerHelper('capitalize', (str: string) =>
  str.charAt(0).toUpperCase() + str.slice(1))

export interface GenerateOptions {
  contractName: string
  address: string
  format: 'foundry' | 'hardhat'
  dryRun?: boolean
}

export function generateMigrationScript(
  diffs: DiffEntry[],
  options: GenerateOptions
): string {
  const changes = diffs.filter(d => d.status === 'changed' || d.status === 'added')

  if (options.dryRun) {
    console.log(`Would generate migration script with ${changes.length} state changes:`)
    for (const c of changes) {
      console.log(`  ${c.name}: ${c.before} → ${c.after}`)
    }
    console.log('No files written (--dry-run)')
    return ''
  }

  const templatePath = join(__dirname, 'templates', `${options.format}.hbs`)
  const template = Handlebars.compile(readFileSync(templatePath, 'utf-8'))
  return template({ ...options, changes })
}
```

**Step 5.3 — Anvil verification**

This is the most complex part of v1. When `--verify` is passed, SlotProbe:
1. Spawns an Anvil process forked at the before-snapshot block
2. Runs the generated migration script using `forge script`
3. Re-captures the fork state before the migration and checks it against `before.json`
4. Takes a new snapshot of the contract after the migration
5. Diffs it against the `after.json` snapshot
6. Passes if all changed variables match, fails with a detailed mismatch summary if not

```typescript
// src/core/migration/verifier.ts
import { execSync, spawn } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { captureSnapshot } from '../snapshot/capture'
import { diffSnapshots } from '../diff/engine'
import type { Snapshot } from '../snapshot/types'

export interface VerificationResult {
  passed: boolean
  message: string
  diff?: ReturnType<typeof diffSnapshots>
}

export async function verifyMigration(
  migrationScript: string,
  beforeSnapshot: Snapshot,
  afterSnapshot: Snapshot,
  rpcUrl: string
): Promise<VerificationResult> {
  // Write migration script to a temp file
  const tmpScript = join(tmpdir(), `SlotProbe_migration_${Date.now()}.s.sol`)
  writeFileSync(tmpScript, migrationScript)

  let anvilProcess: ReturnType<typeof spawn> | null = null

  try {
    // Start Anvil forked at the before-snapshot block
    anvilProcess = spawn('anvil', [
      '--fork-url', rpcUrl,
      '--fork-block-number', beforeSnapshot.blockNumber,
      '--port', '8546',
      '--silent'
    ])

    // Wait for Anvil to be ready
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Run the migration script against the fork
    execSync(`forge script ${tmpScript} --rpc-url http://127.0.0.1:8546 --broadcast`, {
      stdio: 'pipe'
    })

    // Take a post-migration snapshot from the fork
    // (reuse your captureSnapshot from Phase 3, pointed at http://127.0.0.1:8546)
    // Compare with afterSnapshot using diffSnapshots from Phase 4

    return { passed: true, message: 'Migration verified on Anvil fork' }

  } catch (err) {
    return { passed: false, message: `Verification failed: ${err}` }
  } finally {
    anvilProcess?.kill()
    try { unlinkSync(tmpScript) } catch {}
  }
}
```

**Milestone check:** `SlotProbe generate-migration before.json after.json --format foundry --verify` produces a `.s.sol` file and prints either a green "✅ Migration verified" or a red diff showing what does not match.

---

### Phase 6 — CLI Interface

**Goal:** Wire all phases into a polished, well-documented CLI with Commander.js.

**Step 6.1 — Entry point**

```typescript
#!/usr/bin/env node
// src/cli/index.ts
import { Command } from 'commander'
import { snapshotCommand } from './commands/snapshot'
import { diffCommand } from './commands/diff'
import { collisionCommand } from './commands/check-collision'
import { migrationCommand } from './commands/generate-migration'

const program = new Command()
  .name('SlotProbe')
  .description('Smart contract state diffing and safe migration tooling for EVM protocols')
  .version('1.0.0')

program.addCommand(snapshotCommand)
program.addCommand(diffCommand)
program.addCommand(collisionCommand)
program.addCommand(migrationCommand)

program.parse()
```

**Step 6.2 — Snapshot command with all v1 flags**

```typescript
// src/cli/commands/snapshot.ts
import { Command } from 'commander'
import ora from 'ora'

export const snapshotCommand = new Command('snapshot')
  .description('Capture a semantic storage snapshot of a deployed contract')
  .argument('<address>', 'Contract address (0x...)')
  .requiredOption('--chain <chain>', 'Chain name: mainnet, arbitrum, base, optimism, polygon')
  .option('--block <number>', 'Block number to read at (default: latest)')
  .option('--artifact <path>', 'Path to Foundry or Hardhat build artifact')
  .option('--only <vars>', 'Comma-separated list of variable names to snapshot')
  .option('--mapping-keys <path>', 'JSON file with mapping keys to read')
  .option('--out <path>', 'Output file path (default: snapshot.json)')
  .option('--dry-run', 'Show what would be read without making RPC calls')
  .action(async (address, opts) => {
    const spinner = ora('Reading contract storage...').start()
    // Wire to Phase 3 logic
    // Handle --dry-run by calling dryRunSnapshot and exiting
    // Handle --only by calling applyOnlyFilter
    // Save result with saveSnapshot
  })
```

**Step 6.3 — Update `package.json` for CLI distribution**

```json
{
  "name": "SlotProbe",
  "version": "1.0.0",
  "bin": {
    "SlotProbe": "./dist/cli/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "templates"],
  "scripts": {
    "build": "tsup src/index.ts src/cli/index.ts --format cjs,esm --dts",
    "dev": "tsx src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

**Step 6.4 — GitHub Actions workflow (for users to copy into their own repos)**

```yaml
# .github/workflows/SlotProbe-check.yml
name: SlotProbe Storage Check

on:
  pull_request:
    paths:
      - 'src/**/*.sol'
      - 'contracts/**/*.sol'

jobs:
  storage-collision-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Foundry
        uses: foundry-rs/foundry-toolchain@v1

      - name: Install SlotProbe
        run: npm install -g SlotProbe

      - name: Build artifacts
        run: forge build

      - name: Check for storage collisions
        run: |
          SlotProbe check-collision \
            ./out/OldContract.sol/OldContract.json \
            ./out/NewContract.sol/NewContract.json
        # Exits with code 1 if collision detected — fails the PR check
```

---

## 📋 CLI Reference

### `SlotProbe snapshot`

```
Usage: SlotProbe snapshot <address> [options]

Options:
  --chain <chain>          Chain: mainnet | arbitrum | base | optimism | polygon
  --block <number>         Block number (default: latest)
  --artifact <path>        Path to build artifact JSON
  --only <vars>            Comma-separated variable names to include
  --mapping-keys <path>    JSON file with mapping keys: { "varName": ["0xkey1"], "varName[0xkey1]": ["0xnestedKey1"] }
  --out <path>             Output path (default: snapshot.json)
  --dry-run                Preview RPC calls without executing
```

### `SlotProbe diff`

```
Usage: SlotProbe diff <before> <after> [options]

Options:
  --output <format>        Output format: terminal (default) | json | markdown
  --dry-run                Validate inputs and preview the diff plan
```

### `SlotProbe check-collision`

```
Usage: SlotProbe check-collision <old-artifact> <new-artifact> [options]

Options:
  --output <format>        Output format: terminal (default) | json | markdown
  --proxy-pattern <name>   Exclude reserved proxy slots: eip1967 | transparent | uups
  --dry-run                Validate inputs and preview the collision check

Exits with code 1 if any storage collision is detected.
Safe for use in CI pipelines.
```

### `SlotProbe generate-migration`

```
Usage: SlotProbe generate-migration <before> <after> [options]

Options:
  --format <fmt>           foundry (default) | hardhat
  --out <path>             Output script path
  --verify                 Auto-test migration on Anvil fork before shipping
  --rpc-url <url>          RPC URL for Anvil fork (required with --verify)
  --artifact <path>        Contract artifact used to recapture fork state (required with --verify)
  --dry-run                Preview changes without writing files
```

---

## ⚙️ Configuration File

Create `.SlotProberc.json` in your project root:

```json
{
  "defaultChain": "mainnet",
  "chains": {
    "mainnet": "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "base": "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"
  },
  "rpcConfig": {
    "maxConcurrent": 5,
    "retries": 3,
    "backoffMs": 1000
  },
  "artifactsDir": "./out",
  "snapshotsDir": "./snapshots"
}
```

Config values are overridden by CLI flags. All fields are optional — SlotProbe falls back to public RPC endpoints if no URLs are configured (not recommended for production use due to rate limits).

---

## 🧪 Testing Strategy

### Unit Tests

Test every pure function in isolation with known inputs and outputs.

```typescript
// test/unit/slot-calculator.test.ts
import { describe, it, expect } from 'vitest'
import { mappingSlot, arrayElementSlot } from '../../src/core/storage-engine/slot-calculator'

describe('mappingSlot', () => {
  it('computes the correct slot for a mapping(address => uint256)', () => {
    // This is a known value you can verify with: cast storage <address> <computed-slot>
    const key = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as `0x${string}`
    const baseSlot = 0n
    const computed = mappingSlot(key, baseSlot)
    expect(computed).toBe(/* expected value from manual calculation */)
  })
})
```

```typescript
// test/unit/decoder.test.ts
describe('decodeValue', () => {
  it('decodes a bool true', () => {
    expect(decodeValue('0x' + '0'.repeat(63) + '1', 'bool')).toBe(true)
  })
  it('decodes a uint256', () => {
    expect(decodeValue('0x' + '0'.repeat(62) + '64', 'uint256')).toBe('100')
  })
  it('decodes an address', () => {
    const addr = '000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045'
    expect(decodeValue(`0x${addr}`, 'address')).toBe('0xd8da6bf26964af9d7eed9e03e53415d37aa96045')
  })
})
```

### Integration Tests (Anvil Fork)

```typescript
// test/integration/snapshot.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'child_process'

let anvilProcess: ReturnType<typeof spawn>

beforeAll(async () => {
  anvilProcess = spawn('anvil', [
    '--fork-url', process.env.MAINNET_RPC_URL!,
    '--fork-block-number', '19000000',
    '--port', '8547',
    '--silent'
  ])
  await new Promise(resolve => setTimeout(resolve, 2000))
})

afterAll(() => { anvilProcess?.kill() })

describe('Snapshot Integration', () => {
  it('correctly reads USDC decimals from mainnet fork', async () => {
    // USDC at 0xA0b86a33E2441b2c6b18a33f3b29e9b8C4C4F5Cc
    // decimals() returns 6, stored at slot 3 in older USDC implementation
    // Verify your slot calculator gives the right answer and your decoder returns '6'
  })
})
```

### End-to-End Test

Script the full flow: deploy an upgradeable contract to Anvil, take a before snapshot, upgrade it, take an after snapshot, diff, generate migration, verify migration. This is the gold standard test.

---

## 📍 Roadmap

### v1 — Core Workflow (This Document)
- [x] EVM storage engine with packed slot support
- [x] Artifact parser (Foundry + Hardhat)
- [x] Semantic snapshot capture
- [x] `--only` flag for targeted snapshots
- [x] `--dry-run` on all commands
- [x] Basic mapping support via key files
- [x] RPC batching and retry
- [x] Semantic diff engine
- [x] Terminal, JSON, and Markdown output
- [x] Storage collision detector
- [x] Migration script generator (Foundry + Hardhat)
- [x] `--verify` flag with Anvil fork validation
- [x] GitHub Actions workflow

### v2 — Cross-Chain and Power Features
- [ ] Cross-chain consistency checker (same contract, multiple chains)
- [ ] Full mapping enumeration via on-chain event indexing
- [ ] Etherscan auto-fetch for contracts without local artifacts
- [ ] Diamond proxy (EIP-2535) full support
- [ ] Simulation mode with full state transition verification
- [ ] Snapshot timeline — track variable changes over time

### v3 — Ecosystem
- [ ] Snapshot timeline viewer (web UI)
- [ ] Foundry plugin (native `forge SlotProbe` subcommand)
- [ ] API mode for programmatic integration

---

## 🤝 Contributing

SlotProbe is open source under the MIT License. Contributions are welcome.

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Write tests for everything you build
4. Ensure `npm test` passes
5. Submit a pull request with a clear description of what you changed and why

**If you find a real storage bug in a protocol using SlotProbe:** Disclose it responsibly to the protocol team first, following their security disclosure process. Once it is resolved, please share your findings publicly — the community gets stronger when tooling catches real issues.

---

## 📄 License

MIT © SlotProbe Contributors

---

*Built because every serious protocol team was doing this manually with spreadsheets.*
