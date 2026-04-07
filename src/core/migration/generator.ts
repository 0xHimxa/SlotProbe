/**
 * Migration — Script Generator
 *
 * Generates migration scripts from DiffEntry arrays using Handlebars
 * templates. Supports both Foundry (Forge Script) and Hardhat (ethers)
 * output formats. The generated scripts contain setter calls for every
 * changed or added storage variable, with before/after comments.
 *
 * When template files are not found on disk, falls back to inline
 * templates embedded in this module so the tool works without a full
 * installation.
 *
 * @module core/migration/generator
 */

import Handlebars from 'handlebars'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { DiffEntry } from '../diff/types.js'

export type MigrationFormat = 'foundry' | 'hardhat'

export interface GenerateOptions {
  contractName: string
  address: string
  format: MigrationFormat
  dryRun?: boolean
}

/**
 * Register the "capitalize" Handlebars helper so templates can use
 * `{{capitalize name}}` to produce PascalCase setter names like
 * `setFee`, `setOwner`, etc.
 */
Handlebars.registerHelper('capitalize', (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
})

/**
 * Generates a migration script from diff entries.
 * 
 * @param diffs - Array of diff entries to migrate
 * @param options - Generation options
 * @param outPath - Output file path (optional, returns string if not provided)
 * @returns Generated script content
 */
export function generateMigrationScript(
  diffs: DiffEntry[],
  options: GenerateOptions,
  outPath?: string
): string {
  const changes = diffs.filter((d) => d.status === 'changed' || d.status === 'added')

  if (changes.length === 0) {
    console.log('No changes to migrate')
    return ''
  }

  if (options.dryRun) {
    console.log(`Would generate migration script with ${changes.length} state changes:`)
    for (const c of changes) {
      console.log(`  ${c.name}: ${c.before} -> ${c.after}`)
    }
    console.log('No files written (--dry-run)')
    return ''
  }

  const templateName = `${options.format}.hbs`
  const templatePath = join(import.meta.dirname, 'templates', templateName)

  let template: string
  try {
    template = readFileSync(templatePath, 'utf-8')
  } catch {
    console.warn(`Template not found at ${templatePath}, using inline template`)
    template = getInlineTemplate(options.format)
  }

  const compiled = Handlebars.compile(template)
  const content = compiled({ ...options, changes })

  if (outPath) {
    writeFileSync(outPath, content, 'utf-8')
    console.log(`Migration script written to: ${outPath}`)
  }

  return content
}

/**
 * Inline fallback templates if files aren't found.
 */
function getInlineTemplate(format: MigrationFormat): string {
  if (format === 'foundry') {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

contract Migrate{{contractName}} is Script {
    address constant CONTRACT = {{address}};

    function run() external {
        vm.startBroadcast();
        {{#each changes}}
        // {{name}}: {{before}} -> {{after}}
        // TODO: Add setter call for {{name}}
        {{/each}}
        vm.stopBroadcast();
    }
}`
  }

  return `// SPDX-License-Identifier: MIT
import { ethers } from "hardhat";

const CONTRACT = "{{address}}";

async function main() {
  {{#each changes}}
  // {{name}}: {{before}} -> {{after}}
  // TODO: Add setter call for {{name}}
  {{/each}}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});`
}
