/**
 * Collision Detector — Storage Shape Analysis
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  THIS MODULE DECIDES WHETHER AN UPGRADE IS STORAGE-SAFE.           │
 * │                                                                    │
 * │  It compares the old and new layouts as byte-addressable storage   │
 * │  shapes, not just as top-level declarations. That makes nested     │
 * │  struct, mapping, and array changes visible to the collision pass. │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * Architecture Overview
 * ─────────────────────
 * The detector runs in three conceptual phases:
 *
 *   1. **Filter Phase** — optionally removes proxy-reserved slots from
 *      both layouts before comparison.
 *
 *   2. **Flatten Phase** — recursively expands each layout into a list
 *      of comparable "fields", where each field is a concrete byte range
 *      in a specific slot and comparison region.
 *
 *   3. **Compare Phase** — groups old fields by region + slot, then checks
 *      each new field for byte overlap against old fields in that same
 *      logical storage region.
 *
 * Comparison Regions
 * ──────────────────
 * Not every slot number is globally comparable. Slot `0` at the contract
 * root is not the same logical space as slot `0` inside a mapping value
 * template or a dynamic-array element template. The detector tracks a
 * synthetic `region` key so only storage that can alias at runtime gets
 * compared against each other.
 *
 * Rename Safety
 * ─────────────
 * Solidity identifiers do not affect the bytes on chain. Because of that,
 * the detector intentionally ignores names when deciding whether two fields
 * are the "same" preserved storage field. A pure rename with unchanged
 * slot, offset, byte width, and type is treated as safe.
 *
 * @module core/collision/detector
 */

import type {
  StorageLayout,
  StorageVariable,
  TypeInfo,
} from "../artifact-parser/types.js";
import {
  getFixedArrayLength,
  isFixedLengthArray,
} from "../snapshot/capture-helpers.js";
import { excludeProxySlots, type ProxyPattern } from "./proxy-handler.js";

export interface Collision {
  /** Slot number where collision occurs */
  slot: bigint;
  /** Variable from the old contract */
  oldVariable: {
    name: string;
    type: string;
    offset: number;
    bytes: number;
  };
  /** Variable from the new contract */
  newVariable: {
    name: string;
    type: string;
    offset: number;
    bytes: number;
  };
}

export interface CollisionResult {
  /** Whether any collisions were detected */
  hasCollisions: boolean;
  /** List of detected collisions */
  collisions: Collision[];
  /** Total variables checked */
  variablesChecked: number;
}

export interface CollisionOptions {
  /** Optional proxy pattern whose reserved slots should be ignored */
  proxyPattern?: ProxyPattern | null;
}

/**
 * Internal comparison unit produced by the flattening pass.
 *
 * This is the collision module's equivalent of a leaf snapshot entry:
 * one concrete byte range, in one logical region, with enough metadata
 * to both compare and report a conflict clearly.
 */
interface FlattenedField {
  region: string;
  slot: bigint;
  offset: number;
  bytes: number;
  name: string;
  type: string;
}

interface FlattenContext {
  region: string;
  baseSlot: bigint;
  path: string;
}

/**
 * Detects storage collisions between two contract versions.
 *
 * The comparison operates on flattened storage "fields". That includes:
 *   - top-level scalar variables
 *   - mapping root slots plus representative mapping value layouts
 *   - dynamic-array length slots plus representative element layouts
 *   - nested struct members
 *   - fixed-array elements
 *
 * @param oldLayout - Storage layout of the old contract version
 * @param newLayout - Storage layout of the new contract version
 * @param options - Optional detector settings such as proxy slot filtering
 * @returns CollisionResult with `hasCollisions` flag, collision details,
 *          and total variable count
 */
export function detectCollisions(
  oldLayout: StorageLayout,
  newLayout: StorageLayout,
  options: CollisionOptions = {},
): CollisionResult {
  const filteredOldLayout = filterLayout(oldLayout, options.proxyPattern);
  const filteredNewLayout = filterLayout(newLayout, options.proxyPattern);
  const oldFields = flattenLayout(filteredOldLayout);
  const newFields = flattenLayout(filteredNewLayout);
  const collisions: Collision[] = [];
  const oldSlots = new Map<string, FlattenedField[]>();
  const seen = new Set<string>();

  for (const field of oldFields) {
    const key = toRegionSlotKey(field.region, field.slot);
    const existing = oldSlots.get(key) ?? [];
    existing.push(field);
    oldSlots.set(key, existing);
  }

  for (const newField of newFields) {
    const slotKey = toRegionSlotKey(newField.region, newField.slot);
    const oldFieldsAtSlot = oldSlots.get(slotKey);

    if (!oldFieldsAtSlot) continue;

    for (const oldField of oldFieldsAtSlot) {
      if (isSameField(oldField, newField)) {
        continue;
      }

      if (!isOverlapping(oldField, newField)) {
        continue;
      }

      const collisionKey = [
        newField.region,
        newField.slot.toString(),
        oldField.name,
        newField.name,
        oldField.offset,
        newField.offset,
      ].join(":");

      if (seen.has(collisionKey)) {
        continue;
      }

      seen.add(collisionKey);
      collisions.push({
        slot: newField.slot,
        oldVariable: {
          name: oldField.name,
          type: oldField.type,
          offset: oldField.offset,
          bytes: oldField.bytes,
        },
        newVariable: {
          name: newField.name,
          type: newField.type,
          offset: newField.offset,
          bytes: newField.bytes,
        },
      });
    }
  }

  return {
    hasCollisions: collisions.length > 0,
    collisions,
    variablesChecked: oldFields.length + newFields.length,
  };
}

function filterLayout(
  layout: StorageLayout,
  proxyPattern?: ProxyPattern | null,
): StorageLayout {
  if (!proxyPattern) {
    return layout;
  }

  return {
    ...layout,
    variables: excludeProxySlots(
      layout.variables,
      proxyPattern,
    ) as StorageVariable[],
  };
}

/**
 * Expands an entire storage layout into comparable flattened fields.
 *
 * Every top-level variable begins in the shared `root` region. Nested
 * handlers derive additional regions for hashed container internals so
 * representative mapping/dynamic-array shapes stay isolated from root slots.
 */
function flattenLayout(layout: StorageLayout): FlattenedField[] {
  return layout.variables.flatMap((variable) =>
    flattenVariable(layout, variable, {
      region: "root",
      baseSlot: 0n,
      path: "",
    }),
  );
}

/**
 * Recursively expands one storage variable into zero or more flattened fields.
 *
 * Dispatch rules:
 *   - scalar / unknown type info → single leaf field
 *   - mapping                   → root slot + representative value shape
 *   - dynamic array             → length slot + representative element shape
 *   - struct                    → recurse into members
 *   - fixed-length array        → recurse into static element positions
 *
 * The result is precise for static storage and intentionally representative
 * for hashed containers, which is enough to catch layout-shape changes that
 * would make upgrades unsafe.
 */
function flattenVariable(
  layout: StorageLayout,
  variable: StorageVariable,
  context: FlattenContext,
): FlattenedField[] {
  const typeInfo = layout.types[variable.type];
  const absoluteSlot = context.baseSlot + variable.slot;
  const path = joinPath(context.path, variable.name);

  if (!typeInfo) {
    return [
      toField(
        context.region,
        absoluteSlot,
        variable.offset,
        variable.numberOfBytes,
        path,
        variable.label,
      ),
    ];
  }

  if (typeInfo.encoding === "mapping") {
    const fields = [
      toField(
        context.region,
        absoluteSlot,
        variable.offset,
        Math.max(32, variable.numberOfBytes),
        path,
        variable.label,
      ),
    ];

    if (typeInfo.value) {
      fields.push(
        ...flattenTypeAtPosition(layout, typeInfo.value, {
          region: `${context.region}|mapping:${absoluteSlot}:${variable.offset}`,
          baseSlot: 0n,
          path: `${path}<value>`,
          offset: 0,
        }),
      );
    }

    return fields;
  }

  if (typeInfo.encoding === "dynamic_array") {
    const fields = [
      toField(
        context.region,
        absoluteSlot,
        variable.offset,
        Math.max(32, variable.numberOfBytes),
        path,
        variable.label,
      ),
    ];

    if (typeInfo.base) {
      fields.push(
        ...flattenTypeAtPosition(layout, typeInfo.base, {
          region: `${context.region}|dynamic:${absoluteSlot}:${variable.offset}`,
          baseSlot: 0n,
          path: `${path}[0]`,
          offset: 0,
        }),
      );
    }

    return fields;
  }

  if (typeInfo.members?.length) {
    return typeInfo.members.flatMap((member) =>
      flattenVariable(layout, member, {
        region: context.region,
        baseSlot: absoluteSlot,
        path,
      }),
    );
  }

  if (isFixedLengthArray(typeInfo) && typeInfo.base) {
    return flattenFixedArray(
      layout,
      typeInfo,
      absoluteSlot,
      variable.offset,
      path,
      context.region,
    );
  }

  return [
    toField(
      context.region,
      absoluteSlot,
      variable.offset,
      variable.numberOfBytes,
      path,
      variable.label,
    ),
  ];
}

/**
 * Expands an arbitrary type at a caller-supplied slot position.
 *
 * Mapping and array handlers use this to say "pretend a value of type X
 * starts here" and then reuse the normal recursive variable-flattening
 * logic without duplicating the dispatch rules.
 */
function flattenTypeAtPosition(
  layout: StorageLayout,
  typeId: string,
  position: {
    region: string;
    baseSlot: bigint;
    path: string;
    offset: number;
  },
): FlattenedField[] {
  const typeInfo = layout.types[typeId];

  if (!typeInfo) {
    return [];
  }

  return flattenVariable(
    layout,
    {
      name: position.path,
      type: typeId,
      label: typeInfo.label,
      slot: 0n,
      offset: position.offset,
      numberOfBytes: typeInfo.numberOfBytes,
    },
    {
      region: position.region,
      baseSlot: position.baseSlot,
      path: "",
    },
  );
}

/**
 * Expands a fixed-length array into one field-set per static element index.
 *
 * Element locations are derived from byte arithmetic rather than a naive
 * `+1 slot` step because sub-32-byte element types can be packed within
 * a slot. Each computed element position is then fed back through the
 * regular type-expansion path so nested element types recurse normally.
 */
function flattenFixedArray(
  layout: StorageLayout,
  arrayTypeInfo: TypeInfo,
  absoluteSlot: bigint,
  offset: number,
  path: string,
  region: string,
): FlattenedField[] {
  const elementTypeInfo = arrayTypeInfo.base
    ? layout.types[arrayTypeInfo.base]
    : undefined;

  if (!arrayTypeInfo.base || !elementTypeInfo) {
    return [
      toField(
        region,
        absoluteSlot,
        offset,
        arrayTypeInfo.numberOfBytes,
        path,
        arrayTypeInfo.label,
      ),
    ];
  }

  const length = getFixedArrayLength(arrayTypeInfo, elementTypeInfo);
  const fields: FlattenedField[] = [];

  for (let index = 0; index < length; index += 1) {
    const byteOffset = offset + index * elementTypeInfo.numberOfBytes;
    const slotDelta = Math.floor(byteOffset / 32);
    const elementOffset = byteOffset % 32;

    fields.push(
      ...flattenTypeAtPosition(layout, arrayTypeInfo.base, {
        region,
        baseSlot: absoluteSlot + BigInt(slotDelta),
        path: `${path}[${index}]`,
        offset: elementOffset,
      }),
    );
  }

  return fields;
}

/**
 * Small helper that packages a flattened comparison field.
 *
 * Keeping this as a helper makes the recursive traversal code easier to
 * read by separating "where are we in storage?" from object assembly.
 */
function toField(
  region: string,
  slot: bigint,
  offset: number,
  bytes: number,
  name: string,
  type: string,
): FlattenedField {
  return { region, slot, offset, bytes, name, type };
}

/**
 * Builds semantic field paths for readable collision reports.
 *
 * Dot notation is used for named members while bracket / angle-bracket
 * suffixes are appended directly:
 *
 *   config.owner
 *   users[0]
 *   balances<value>.amount
 */
function joinPath(base: string, segment: string): string {
  if (!base) {
    return segment;
  }

  if (segment.startsWith("[") || segment.startsWith("<")) {
    return `${base}${segment}`;
  }

  return `${base}.${segment}`;
}

/**
 * Produces the lookup key used for overlap grouping.
 *
 * Region is part of the key so slot `0` in one logical storage space is
 * never compared against slot `0` in some unrelated storage template.
 */
function toRegionSlotKey(region: string, slot: bigint): string {
  return `${region}:${slot.toString()}`;
}

/**
 * Checks if two variables overlap in byte ranges within a shared slot.
 * Uses standard interval overlap logic: two intervals [aStart, aEnd)
 * and [bStart, bEnd) overlap iff aStart < bEnd AND bStart < aEnd.
 *
 * @param a - First variable's offset and size
 * @param b - Second variable's offset and size
 * @returns true if the byte ranges overlap
 */
function isOverlapping(
  a: { offset: number; bytes: number },
  b: { offset: number; bytes: number },
): boolean {
  const aStart = a.offset;
  const aEnd = a.offset + a.bytes;
  const bStart = b.offset;
  const bEnd = b.offset + b.bytes;

  return aStart < bEnd && bStart < aEnd;
}

/**
 * Determines whether two flattened fields represent the same storage field.
 *
 * Equality is based on storage shape, not Solidity identifier. Name is
 * intentionally ignored so pure renames are treated as safe when the
 * underlying bytes, slot position, and type remain unchanged.
 */
function isSameField(a: FlattenedField, b: FlattenedField): boolean {
  return (
    a.region === b.region &&
    a.slot === b.slot &&
    a.offset === b.offset &&
    a.bytes === b.bytes &&
    a.type === b.type
  );
}

/**
 * Convenience wrapper that returns true when the upgrade is safe.
 *
 * @param result - CollisionResult from detectCollisions
 * @returns true if no collisions were detected
 */
export function isUpgradeSafe(result: CollisionResult): boolean {
  return !result.hasCollisions;
}
