/**
 * Migration - Generator
 * 
 * Generates migration scripts from diffs.
 * Supports Foundry and Hardhat formats.
 */

import Handlebars from 'handlebars'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import type { DiffEntry } from '../diff/types.js'

export type MigrationFormat = 'foundry' | 'hardhat'

export interface GenerateOptions {
  contractName: string
  address: string
  format: MigrationFormat
  dryRun?: boolean
}

/**
 * Register custom Handlebars helpers.
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
pragma solidity ^0.8.19;

const address CONTRACT = '{{address}}';

async function run() {
  {{#each changes}}
  // {{name}}: {{before}} -> {{after}}
  // TODO: Add setter call for {{name}}
  {{/each}}
}

module.exports = run;`
}
