import type { BlockAssignment, FloorLevel } from '../types';

export const BLOCK_IDS = Array.from({ length: 23 }, (_, i) => i + 1);

export const RDC_BLOCKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export const MEZZANINE_BLOCKS = [14, 15, 16, 17, 18, 19, 20, 21, 22, 23] as const;

export function getFloorForBlock(blockId: number): FloorLevel {
  return blockId <= 13 ? 'rdc' : 'mezzanine';
}

export function createEmptyBlocks(): Record<number, BlockAssignment> {
  const blocks: Record<number, BlockAssignment> = {};
  for (const id of BLOCK_IDS) {
    blocks[id] = { person1: null, person2: null };
  }
  return blocks;
}

export function occupancyCount(
  assignment: BlockAssignment | null | undefined,
): 0 | 1 | 2 {
  if (!assignment) return 0;
  const filled = [assignment.person1, assignment.person2].filter(Boolean).length;
  return filled as 0 | 1 | 2;
}

export function occupancyClass(count: 0 | 1 | 2): string {
  if (count === 0) return 'empty';
  if (count === 1) return 'partial';
  return 'full';
}
