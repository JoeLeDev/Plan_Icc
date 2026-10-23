import { describe, expect, it } from 'vitest';
import { BLOCK_IDS, createEmptyBlocks } from '../data/blocks';
import type { Member, PlacementWorkspace, SlotKey } from '../types';
import {
  MAX_PER_BLOCK,
  MAX_TOTAL_PLACES,
  addMember,
  assignByName,
  assignMemberToSlot,
  clearBlock,
  clearSlot,
  countPlaced,
  countPlacedOnFloor,
  findMemberLocation,
  removeMember,
  resetAll,
  sanitizeState,
} from './placement';

function emptyState(members: Member[] = []): PlacementWorkspace {
  return { members, blocks: createEmptyBlocks() };
}

function member(id: string, name: string): Member {
  return { id, name };
}

function fillAllSlots(state: PlacementWorkspace): PlacementWorkspace {
  let next = state;
  let i = 0;
  for (const id of BLOCK_IDS) {
    for (const slot of ['person1', 'person2'] as const) {
      const m = next.members[i];
      if (!m) throw new Error('Pas assez de membres');
      const result = assignMemberToSlot(next, m.id, id, slot);
      if (!result.ok) throw new Error(result.error);
      next = result.state;
      i += 1;
    }
  }
  return next;
}

function findFreeSlot(
  blocks: PlacementWorkspace['blocks'],
): { blockId: number; slot: SlotKey } | null {
  for (const id of BLOCK_IDS) {
    const a = blocks[id]!;
    if (!a.person1) return { blockId: id, slot: 'person1' };
    if (!a.person2) return { blockId: id, slot: 'person2' };
  }
  return null;
}

describe('addMember', () => {
  it('ajoute un membre avec un id unique', () => {
    const result = addMember(emptyState(), 'Alice Dupont');
    expect(result.ok).toBe(true);
    expect(result.state.members).toHaveLength(1);
    expect(result.state.members[0]?.name).toBe('Alice Dupont');
    expect(result.memberId).toBe(result.state.members[0]?.id);
  });

  it('refuse un nom vide', () => {
    const result = addMember(emptyState(), '   ');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('empty_name');
  });

  it('refuse un doublon de nom (insensible à la casse)', () => {
    const base = addMember(emptyState(), 'Alice').state;
    const result = addMember(base, 'alice');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('duplicate_name');
  });
});

describe('assignMemberToSlot', () => {
  it('affecte un membre à un emplacement libre', () => {
    const state = emptyState([member('a1', 'Alice')]);
    const result = assignMemberToSlot(state, 'a1', 1, 'person1');
    expect(result.ok).toBe(true);
    expect(result.state.blocks[1]?.person1).toBe('a1');
    expect(countPlaced(result.state.blocks)).toBe(1);
  });

  it('refuse un membre inconnu', () => {
    const result = assignMemberToSlot(emptyState(), 'x', 1, 'person1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unknown_member');
  });

  it('refuse un bloc invalide', () => {
    const state = emptyState([member('a1', 'Alice')]);
    const result = assignMemberToSlot(state, 'a1', 99, 'person1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('unknown_block');
  });

  it('interdit d’occuper un emplacement déjà pris sans overwrite', () => {
    let state = emptyState([member('a1', 'Alice'), member('b1', 'Bob')]);
    state = assignMemberToSlot(state, 'a1', 1, 'person1').state;
    const result = assignMemberToSlot(state, 'b1', 1, 'person1');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('slot_occupied');
  });

  it('remplace avec overwrite', () => {
    let state = emptyState([member('a1', 'Alice'), member('b1', 'Bob')]);
    state = assignMemberToSlot(state, 'a1', 1, 'person1').state;
    const result = assignMemberToSlot(state, 'b1', 1, 'person1', {
      overwrite: true,
    });
    expect(result.ok).toBe(true);
    expect(result.state.blocks[1]?.person1).toBe('b1');
    expect(findMemberLocation(result.state.blocks, 'a1')).toBeNull();
  });

  it('limite à deux personnes par bloc', () => {
    let state = emptyState([
      member('a1', 'Alice'),
      member('b1', 'Bob'),
      member('c1', 'Carla'),
    ]);
    state = assignMemberToSlot(state, 'a1', 5, 'person1').state;
    state = assignMemberToSlot(state, 'b1', 5, 'person2').state;
    expect(countPlaced(state.blocks)).toBe(MAX_PER_BLOCK);
    expect(assignMemberToSlot(state, 'c1', 5, 'person1').code).toBe(
      'slot_occupied',
    );
    expect(assignMemberToSlot(state, 'c1', 5, 'person2').code).toBe(
      'slot_occupied',
    );
  });

  it('empêche qu’un membre occupe deux emplacements', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 1, 'person1', {
      confirmMove: true,
    }).state;
    const moved = assignMemberToSlot(state, 'a1', 14, 'person1', {
      confirmMove: true,
    });
    expect(moved.ok).toBe(true);
    expect(moved.state.blocks[1]?.person1).toBeNull();
    expect(moved.state.blocks[14]?.person1).toBe('a1');
    expect(countPlaced(moved.state.blocks)).toBe(1);
  });

  it('demande confirmation avant un déplacement inter-blocs', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 3, 'person1').state;
    const result = assignMemberToSlot(state, 'a1', 20, 'person2');
    expect(result.ok).toBe(false);
    expect(result.moveFrom).toEqual({ blockId: 3, slot: 'person1' });
    expect(result.state.blocks[3]?.person1).toBe('a1');
  });

  it('déplace après confirmation', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 3, 'person1').state;
    const moved = assignMemberToSlot(state, 'a1', 20, 'person2', {
      confirmMove: true,
    });
    expect(moved.ok).toBe(true);
    expect(moved.state.blocks[3]?.person1).toBeNull();
    expect(moved.state.blocks[20]?.person2).toBe('a1');
  });

  it('remplit au maximum 46 places et met à jour les compteurs par niveau', () => {
    expect(MAX_TOTAL_PLACES).toBe(46);
    const members = Array.from({ length: 46 }, (_, i) =>
      member(`p${i}`, `Person ${i}`),
    );
    const state = fillAllSlots(emptyState(members));
    expect(countPlaced(state.blocks)).toBe(46);
    expect(findFreeSlot(state.blocks)).toBeNull();
    expect(countPlacedOnFloor(state.blocks, 'rdc')).toBe(26);
    expect(countPlacedOnFloor(state.blocks, 'mezzanine')).toBe(20);

    const blocked = assignMemberToSlot(
      {
        ...state,
        members: [...members, member('extra', 'Extra')],
      },
      'extra',
      1,
      'person1',
    );
    expect(blocked.ok).toBe(false);
    expect(blocked.code).toBe('slot_occupied');
  });

});

describe('clearSlot / clearBlock / removeMember', () => {
  it('retire un membre d’un emplacement', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 7, 'person2').state;
    state = clearSlot(state, 7, 'person2');
    expect(state.blocks[7]?.person2).toBeNull();
    expect(findMemberLocation(state.blocks, 'a1')).toBeNull();
  });

  it('vide un bloc entier', () => {
    let state = emptyState([member('a1', 'Alice'), member('b1', 'Bob')]);
    state = assignMemberToSlot(state, 'a1', 8, 'person1').state;
    state = assignMemberToSlot(state, 'b1', 8, 'person2').state;
    state = clearBlock(state, 8);
    expect(state.blocks[8]).toEqual({ person1: null, person2: null });
  });

  it('supprime un membre et libère son emplacement', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 2, 'person1').state;
    state = removeMember(state, 'a1');
    expect(state.members).toHaveLength(0);
    expect(state.blocks[2]?.person1).toBeNull();
  });
});

describe('assignByName', () => {
  it('crée et affecte un nouveau membre', () => {
    const result = assignByName(emptyState(), 14, 'person1', 'Zoe Martin');
    expect(result.ok).toBe(true);
    expect(result.state.members).toHaveLength(1);
    expect(result.state.blocks[14]?.person1).toBe(result.memberId);
  });

  it('réutilise un membre existant par nom', () => {
    const base = addMember(emptyState(), 'Zoe Martin').state;
    const result = assignByName(base, 15, 'person1', 'zoe martin');
    expect(result.ok).toBe(true);
    expect(result.state.members).toHaveLength(1);
    expect(result.state.blocks[15]?.person1).toBe(base.members[0]?.id);
  });
});

describe('sanitizeState', () => {
  it('préserve les affectations valides', () => {
    const members = [member('a1', 'Alice'), member('b1', 'Bob')];
    const blocks = createEmptyBlocks();
    blocks[1] = { person1: 'a1', person2: 'b1' };
    const clean = sanitizeState({ members, blocks });
    expect(clean.blocks[1]).toEqual({ person1: 'a1', person2: 'b1' });
    expect(clean.members).toHaveLength(2);
  });

  it('retire les références orphelines et les doublons', () => {
    const members = [member('a1', 'Alice')];
    const blocks = createEmptyBlocks();
    blocks[1] = { person1: 'a1', person2: 'ghost' };
    blocks[2] = { person1: 'a1', person2: null };
    const clean = sanitizeState({ members, blocks });
    expect(clean.blocks[1]?.person1).toBe('a1');
    expect(clean.blocks[1]?.person2).toBeNull();
    expect(clean.blocks[2]?.person1).toBeNull();
  });
});

describe('resetAll', () => {
  it('réinitialise membres et blocs', () => {
    let state = emptyState([member('a1', 'Alice')]);
    state = assignMemberToSlot(state, 'a1', 1, 'person1').state;
    const cleared = resetAll();
    expect(cleared.members).toEqual([]);
    expect(countPlaced(cleared.blocks)).toBe(0);
  });
});
