# 🔬 SlotProbe

> **The missing developer tool for EVM protocol teams** — snapshot, diff, and safely migrate smart contract storage across upgrades. No more manual slot hunting. No more blind upgrades.

[![npm version](https://img.shields.io/npm/v/slotprobe.svg)](https://www.npmjs.com/package/slotprobe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)](https://www.typescriptlang.org/)
[![Node >=20](https://img.shields.io/badge/Node-%3E%3D20-green)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## What Does It Solve?

Every serious EVM protocol eventually hits these walls:

| Problem | What usually happens | What SlotProbe does |
|---------|---------------------|---------------------|
| **Proxy upgrade** | You hope the new implementation doesn't clobber `_owner` at slot 3 | Detects byte-range collisions before you deploy |
| **Post-upgrade audit** | You diff raw hex values in a spreadsheet | Named variable-level diff (e.g. `balances[0xdead]` changed from `100` → `200`) |
| **Migration scripts** | You write one, run it on a fork, and pray | Generates the script, then verifies it on an Anvil fork automatically |

```
snapshot → semantic diff → collision check → migration script → auto-verify on fork
```

---

## Install

```bash
npm install -g slotprobe
slotprobe --help
```

Or use it without a global install:

```bash
npx slotprobe --help
```

**Requirements:** Node.js ≥ 20, [Foundry](https://getfoundry.sh) (for `forge build` artifacts and `anvil` verification)

---

## Quick Start

### 1. Snapshot a Contract's Storage

```bash
# Point at any deployed contract with a local Foundry artifact
slotprobe snapshot 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --artifact ./out/MyToken.sol/MyToken.json \
  --chain mainnet \
  --block 21000000 \
  --output ./snapshots/before.json
```

<details>
<summary>Example output</summary>

```
✔ Captured 12 variables (34 slots) in 1.2s

┌─────────────────────────┬───────────────────────────────────────────┐
│ Variable                │ Value                                     │
├─────────────────────────┼───────────────────────────────────────────┤
│ _owner                  │ 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045│
│ totalSupply             │ 1000000000000000000                        │
│ paused                  │ false                                      │
│ balances[0xdead...]     │ 500000000000                               │
└─────────────────────────┴───────────────────────────────────────────┘
```

</details>

### 2. Diff Two Snapshots

```bash
slotprobe diff ./snapshots/before.json ./snapshots/after.json
```

<details>
<summary>Example output</summary>

```
~ totalSupply       1000000000000000000  →  1500000000000000000  (+500000000000000000)
+ newVariable       0                                             (added)
- removedVar        42                                            (removed)
  _owner            0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045  (unchanged)
```

</details>

### 3. Check for Storage Collisions Before Upgrading

```bash
slotprobe check-collision \
  ./out/ImplementationV1.sol/ImplementationV1.json \
  ./out/ImplementationV2.sol/ImplementationV2.json
```

SlotProbe exits with code `1` if any collision is detected — making it CI-friendly.

### 4. Generate a Migration Script

```bash
slotprobe generate-migration \
  ./snapshots/before.json \
  ./snapshots/after.json \
  --framework foundry \
  --output ./script/Migrate.s.sol
```

Add `--verify` to automatically run the script on an Anvil fork and confirm the resulting state matches your expected snapshot.

---

## All Commands

```
slotprobe snapshot <address>                Capture contract storage to a JSON snapshot
slotprobe diff <before> <after>             Semantic diff of two snapshots
slotprobe check-collision <old> <new>       Detect byte-range slot collisions between two layouts
slotprobe generate-migration <bef> <aft>    Generate a Foundry or Hardhat migration script
```

### Global Flags

| Flag | Description |
|------|-------------|
| `--chain <name>` | Chain to use (`mainnet`, `arbitrum`, `base`, `optimism`, `polygon`) |
| `--rpc <url>` | Override the RPC endpoint |
| `--output <format>` | Output format: `terminal` (default), `json`, `markdown` |
| `--block <number>` | Pin to a specific block number |

### Snapshot Flags

| Flag | Description |
|------|-------------|
| `--artifact <path>` | Path to Foundry or Hardhat build artifact |
| `--only <vars>` | Comma-separated list of variable names to capture (e.g. `_owner,totalSupply`) |
| `--dry-run` | Estimate slot count without fetching any data |
| `--mapping-keys <path>` | JSON file mapping variable names to keys to probe |

### Migration Flags

| Flag | Description |
|------|-------------|
| `--framework <name>` | Output framework: `foundry` (default) or `hardhat` |
| `--verify` | Run the generated script on an Anvil fork and verify the result |

---

## Configuration

SlotProbe auto-discovers config from the project root. Recognised filenames:

- `.SlotProberc.json`
- `.slotprobe.json`
- `slotprobe.config.json`

Copy the example to get started:

```bash
cp .SlotProberc.example.json slotprobe.config.json
```

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
    "mainnet":  "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "arbitrum": "https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "base":     "https://base-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "optimism": "https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY",
    "polygon":  "https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY"
  },
  "artifactsDir": "./out",
  "snapshotsDir": "./snapshots"
}
```

All fields are optional — defaults are applied automatically. Config values are always overridden by CLI flags.

> **Note:** SlotProbe works without config using public RPCs, but public RPCs have aggressive rate limits. A private RPC URL is strongly recommended for production usage.

---

## Mapping Keys

Solidity mappings can't be enumerated on-chain. Supply a key file so SlotProbe knows which entries to probe:

```json
{
  "balances": [
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  ],
  "allowances": {
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045": [
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    ]
  }
}
```

```bash
slotprobe snapshot <address> --artifact ./out/... --mapping-keys ./keys.json
```

---

## Use in CI (GitHub Actions)

Copy the example workflow from `.github/workflows/slotprobe-check.yml` into your own repo:

```yaml
name: Storage Collision Check

on:
  pull_request:
    paths:
      - 'src/**/*.sol'
      - 'contracts/**/*.sol'

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: foundry-rs/foundry-toolchain@v1
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm install -g slotprobe
      - run: forge build
      - run: |
          slotprobe check-collision \
            ./out/ImplementationV1.sol/ImplementationV1.json \
            ./out/ImplementationV2.sol/ImplementationV2.json
```

The `check-collision` command exits with code `1` on any collision, which fails the workflow.

---

## Use as a Library

SlotProbe exports a typed programmatic API alongside the CLI:

```typescript
import { snapshot, diff, collision } from 'slotprobe'

// Capture storage
const result = await snapshot.captureSnapshot({
  address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  layout: parsedLayout,
  chain: 'mainnet',
})

// Diff two captures
const diffResult = diff.diffSnapshots(before, after)

// Check for collisions
const report = collision.detectCollisions(layoutV1, layoutV2)
```

Full type definitions are included (`dist/core/index.d.ts`).

---

## How It Works

SlotProbe reads raw 32-byte slots from the chain via `eth_getStorageAt`, then maps them back to **named Solidity variables** using the compiler's `storageLayout` output from `forge build` or Hardhat.

```
Foundry / Hardhat artifact
         │
         ▼
  Artifact Parser           ← Normalises compiler output into a typed StorageLayout
         │
         ▼
  Capture Pipeline          ← Recursively walks variables: scalars, structs, arrays, mappings
         │
         ▼
  Storage Engine            ← keccak256 slot math, packed-slot extraction, hex → typed value
         │
         ▼
  RPC Layer                 ← eth_getStorageAt with batching, dedup, and exponential backoff
         │
         ▼
  Named Snapshot JSON       ← { "_owner": "0x...", "totalSupply": "1000000..." }
```

The pipeline supports packed slots (multiple variables in one 32-byte slot), nested structs, dynamic arrays, fixed-length arrays, and mappings (with user-supplied keys).

---

## Tech Stack

| Category | Package |
|----------|---------|
| Language | TypeScript 6.x |
| Blockchain RPC | `viem` ^2.x |
| Schema validation | `zod` ^4.x |
| CLI framework | `commander` ^14.x |
| Terminal output | `chalk` ^5.x, `ora` ^9.x, `cli-table3` ^0.6.x |
| Script templates | `handlebars` ^4.x |
| Concurrency | `p-limit` ^7.x, `p-retry` ^8.x |
| Testing | `vitest` ^4.x |
| Build | `tsup` ^8.x |

---

## v1 Feature Status

- [x] Storage engine — slot reading, packed slots, full type decoding
- [x] Artifact parser — Foundry + Hardhat auto-detection
- [x] Recursive snapshot capture — scalars, structs, dynamic arrays, fixed arrays, mappings
- [x] `--only` flag for targeted snapshots
- [x] `--dry-run` estimation mode
- [x] RPC batching, deduplication, retry, and rate limiting
- [x] Semantic diff engine at variable-name level
- [x] Terminal, JSON, and Markdown output formatters
- [x] Storage collision detector with byte-range overlap checking
- [x] EIP-1967 / Transparent / UUPS proxy-aware collision filtering
- [x] Migration script generator (Foundry + Hardhat templates)
- [x] `--verify` flag with Anvil fork validation
- [x] Full CLI wiring for all 4 commands
- [x] 11 unit test files + 4 integration test files

### Roadmap

- [ ] Cross-chain consistency checker
- [ ] Full mapping enumeration via event log indexing
- [ ] Etherscan auto-fetch for contracts without local artifacts
- [ ] Diamond proxy (EIP-2535) support
- [ ] Snapshot timeline — track variable changes over time

---

## Contributing

SlotProbe is open source under the MIT License and welcomes contributions of all sizes.

See **[CONTRIBUTING.md](CONTRIBUTING.md)** for:
- Development setup
- A structured 4-layer learning path through the codebase
- Complete file-by-file reference
- PR process and code standards

---

## License

MIT © 2026 [0xHimxa](https://github.com/0xHimxa)

---

*Built because every serious protocol team was doing this manually with spreadsheets.*
