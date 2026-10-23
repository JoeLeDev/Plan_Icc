import { BLOCK_IDS, createEmptyBlocks, occupancyCount } from '../data/blocks';
import type {
  BlockAssignment,
  Member,
  PlacementWorkspace,
  SlotKey,
} from '../types';

export const MAX_PER_BLOCK = 2;
export const MAX_TOTAL_PLACES = BLOCK_IDS.length * MAX_PER_BLOCK; // 46

export type PlacementErrorCode =
  | 'empty_name'
  | 'unknown_member'
  | 'unknown_block'
  | 'slot_occupied'
  | 'block_full'
  | 'capacity_reached'
  | 'already_here'
  | 'duplicate_name'
  | 'plan_locked';

export type PlacementResult = {
  ok: boolean;
  state: PlacementWorkspace;
  error?: string;
  code?: PlacementErrorCode;
  /** Membre déjà placé ailleurs — l’UI doit confirmer le déplacement. */
  moveFrom?: { blockId: number; slot: SlotKey };
  memberId?: string;
};

export function createId(): string {
  return crypto.randomUUID();
}

export function findMemberLocation(
  blocks: Record<number, BlockAssignment>,
  memberId: string,
): { blockId: number; slot: SlotKey } | null {
  for (const id of BLOCK_IDS) {
    const assignment = blocks[id];
    if (!assignment) continue;
    if (assignment.person1 === memberId) return { blockId: id, slot: 'person1' };
    if (assignment.person2 === memberId) return { blockId: id, slot: 'person2' };
  }
  return null;
}

export function isMemberPlaced(
  blocks: Record<number, BlockAssignment>,
  memberId: string,
): boolean {
  return findMemberLocation(blocks, memberId) !== null;
}

export function getMemberName(
  members: Member[],
  memberId: string | null,
): string {
  if (!memberId) return '';
  return members.find((m) => m.id === memberId)?.name ?? '';
}

export function findMemberByName(
  members: Member[],
  name: string,
): Member | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  return members.find(
    (m) => m.name.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'),
  );
}

export function countPlaced(blocks: Record<number, BlockAssignment>): number {
  let n = 0;
  for (const id of BLOCK_IDS) {
    const a = blocks[id];
    if (!a) continue;
    if (a.person1) n += 1;
    if (a.person2) n += 1;
  }
  return n;
}

export function countFullBlocks(
  blocks: Record<number, BlockAssignment>,
): number {
  return BLOCK_IDS.filter((id) => {
    const a = blocks[id];
    return Boolean(a?.person1 && a?.person2);
  }).length;
}

export function countPlacedOnFloor(
  blocks: Record<number, BlockAssignment>,
  floor: 'rdc' | 'mezzanine',
): number {
  const ids =
    floor === 'rdc'
      ? BLOCK_IDS.filter((id) => id <= 13)
      : BLOCK_IDS.filter((id) => id >= 14);
  let n = 0;
  for (const id of ids) {
    const a = blocks[id];
    if (!a) continue;
    if (a.person1) n += 1;
    if (a.person2) n += 1;
  }
  return n;
}

export function sanitizeMembers(rawMembers: Member[]): Member[] {
  const members: Member[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();

  for (const raw of rawMembers ?? []) {
    if (!raw || typeof raw.id !== 'string' || typeof raw.name !== 'string') {
      continue;
    }
    const name = raw.name.trim();
    if (!name || seenIds.has(raw.id)) continue;
    const key = name.toLocaleLowerCase('fr');
    if (seenNames.has(key)) continue;
    seenIds.add(raw.id);
    seenNames.add(key);
    members.push({ id: raw.id, name });
  }
  return members;
}

export function sanitizeAssignments(
  rawBlocks: Record<number, BlockAssignment> | undefined,
  validIds: Set<string>,
): Record<number, BlockAssignment> {
  const blocks = createEmptyBlocks();
  const placed = new Set<string>();

  for (const id of BLOCK_IDS) {
    const src = rawBlocks?.[id];
    if (!src) continue;
    const next: BlockAssignment = { person1: null, person2: null };
    for (const slot of ['person1', 'person2'] as const) {
      const memberId = src[slot];
      if (
        typeof memberId === 'string' &&
        validIds.has(memberId) &&
        !placed.has(memberId)
      ) {
        next[slot] = memberId;
        placed.add(memberId);
      }
    }
    blocks[id] = next;
  }
  return blocks;
}

/** Nettoie les références orphelines et les doublons d’affectation. */
export function sanitizeWorkspace(
  state: PlacementWorkspace,
): PlacementWorkspace {
  const members = sanitizeMembers(state.members ?? []);
  const validIds = new Set(members.map((m) => m.id));
  return {
    members,
    blocks: sanitizeAssignments(state.blocks, validIds),
  };
}

/** @deprecated Prefer sanitizeWorkspace — alias de compatibilité. */
export function sanitizeState(state: PlacementWorkspace): PlacementWorkspace {
  return sanitizeWorkspace(state);
}

export function addMember(
  state: PlacementWorkspace,
  name: string,
): PlacementResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      ok: false,
      state,
      code: 'empty_name',
      error: 'Veuillez saisir un nom.',
    };
  }
  if (findMemberByName(state.members, trimmed)) {
    return {
      ok: false,
      state,
      code: 'duplicate_name',
      error: `Le membre « ${trimmed} » existe déjà.`,
    };
  }
  const member: Member = { id: createId(), name: trimmed };
  return {
    ok: true,
    state: { ...state, members: [...state.members, member] },
    memberId: member.id,
  };
}

export function removeMember(
  state: PlacementWorkspace,
  memberId: string,
): PlacementWorkspace {
  const blocks = { ...state.blocks };
  for (const id of BLOCK_IDS) {
    const a = blocks[id];
    if (!a) continue;
    const next = { ...a };
    if (next.person1 === memberId) next.person1 = null;
    if (next.person2 === memberId) next.person2 = null;
    blocks[id] = next;
  }
  return {
    members: state.members.filter((m) => m.id !== memberId),
    blocks,
  };
}

export function clearSlot(
  state: PlacementWorkspace,
  blockId: number,
  slot: SlotKey,
): PlacementWorkspace {
  const current = state.blocks[blockId];
  if (!current) return state;
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [blockId]: { ...current, [slot]: null },
    },
  };
}

export function clearBlock(
  state: PlacementWorkspace,
  blockId: number,
): PlacementWorkspace {
  if (!state.blocks[blockId]) return state;
  return {
    ...state,
    blocks: {
      ...state.blocks,
      [blockId]: { person1: null, person2: null },
    },
  };
}

type AssignOptions = {
  overwrite?: boolean;
  /** Confirmer un déplacement depuis un autre bloc. */
  confirmMove?: boolean;
};

export function assignMemberToSlot(
  state: PlacementWorkspace,
  memberId: string,
  blockId: number,
  slot: SlotKey,
  options: AssignOptions = {},
): PlacementResult {
  if (!BLOCK_IDS.includes(blockId) || !state.blocks[blockId]) {
    return {
      ok: false,
      state,
      code: 'unknown_block',
      error: `Le bloc ${blockId} est invalide.`,
    };
  }

  const member = state.members.find((m) => m.id === memberId);
  if (!member) {
    return {
      ok: false,
      state,
      code: 'unknown_member',
      error: 'Membre introuvable.',
    };
  }

  const target = state.blocks[blockId];
  if (target[slot] === memberId) {
    return { ok: true, state, memberId, code: 'already_here' };
  }

  const previous = findMemberLocation(state.blocks, memberId);
  if (previous && previous.blockId === blockId && previous.slot !== slot) {
    // Déjà dans ce bloc sur l’autre emplacement : simple permutation / déplacement interne
  } else if (previous && previous.blockId !== blockId && !options.confirmMove) {
    return {
      ok: false,
      state,
      code: 'already_here',
      error: `${member.name} est déjà placé au bloc ${previous.blockId}. Confirmez pour le déplacer.`,
      moveFrom: previous,
      memberId,
    };
  }

  if (target[slot] && target[slot] !== memberId && !options.overwrite) {
    const occupant = getMemberName(state.members, target[slot]);
    return {
      ok: false,
      state,
      code: 'slot_occupied',
      error: `L’emplacement est déjà occupé par ${occupant || 'un autre membre'}.`,
      memberId,
    };
  }

  const isNewPlacement = !previous;
  if (isNewPlacement && !target[slot]) {
    if (countPlaced(state.blocks) >= MAX_TOTAL_PLACES) {
      return {
        ok: false,
        state,
        code: 'capacity_reached',
        error: `Capacité maximale atteinte (${MAX_TOTAL_PLACES} personnes).`,
        memberId,
      };
    }
  }

  if (
    occupancyCount(target) >= MAX_PER_BLOCK &&
    !target[slot] &&
    !options.overwrite
  ) {
    return {
      ok: false,
      state,
      code: 'block_full',
      error: `Le bloc ${blockId} est déjà complet (2/2).`,
      memberId,
    };
  }

  const blocks = { ...state.blocks };
  if (previous) {
    blocks[previous.blockId] = {
      ...blocks[previous.blockId],
      [previous.slot]: null,
    };
  }

  blocks[blockId] = {
    ...blocks[blockId],
    [slot]: memberId,
  };

  return { ok: true, state: { ...state, blocks }, memberId };
}

export function assignByName(
  state: PlacementWorkspace,
  blockId: number,
  slot: SlotKey,
  name: string,
  options: AssignOptions = {},
): PlacementResult {
  const trimmed = name.trim();
  if (!trimmed) {
    return {
      ok: false,
      state,
      code: 'empty_name',
      error: 'Veuillez saisir un nom.',
    };
  }

  let next = state;
  let member = findMemberByName(state.members, trimmed);
  if (!member) {
    const created = addMember(state, trimmed);
    if (!created.ok || !created.memberId) return created;
    next = created.state;
    member = next.members.find((m) => m.id === created.memberId)!;
  }

  return assignMemberToSlot(next, member.id, blockId, slot, {
    overwrite: true,
    ...options,
  });
}

/** @deprecated Prefer assignByName */
export function setSlotByName(
  state: PlacementWorkspace,
  blockId: number,
  slot: SlotKey,
  name: string,
): PlacementWorkspace {
  return assignByName(state, blockId, slot, name, {
    overwrite: true,
    confirmMove: true,
  }).state;
}

export function resetWorkspace(): PlacementWorkspace {
  return { members: [], blocks: createEmptyBlocks() };
}

/** @deprecated Prefer resetWorkspace */
export function resetAll(): PlacementWorkspace {
  return resetWorkspace();
}

export function firstFreeSlot(
  assignment: BlockAssignment,
): SlotKey | null {
  if (!assignment.person1) return 'person1';
  if (!assignment.person2) return 'person2';
  return null;
}
