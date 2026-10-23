import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyBlocks } from '../data/blocks';
import type { AppState, Member } from '../types';
import {
  addBlankPlan,
  addMemberToDirectory,
  createInitialAppState,
  removeMemberFromApp,
  setActiveAssignment,
  setPlanStatus,
} from './plans';
import {
  STORAGE_KEY_V1,
  STORAGE_KEY_V2,
  loadState,
  restoreGlobalBackup,
  saveState,
} from './storage';

function member(id: string, name: string): Member {
  return { id, name };
}

const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => {
      memory.set(k, v);
    },
    removeItem: (k: string) => {
      memory.delete(k);
    },
    clear: () => memory.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadState / localStorage invalide', () => {
  it('retourne un état initial si JSON corrompu', () => {
    memory.set(STORAGE_KEY_V2, '{not-json');
    const state = loadState();
    expect(state.plans.length).toBeGreaterThanOrEqual(1);
    expect(state.members).toEqual([]);
  });

  it('sanitise un objet v2 partiel / invalide', () => {
    memory.set(
      STORAGE_KEY_V2,
      JSON.stringify({ members: 'oops', plans: null, activePlanId: 42 }),
    );
    const state = loadState();
    expect(Array.isArray(state.members)).toBe(true);
    expect(state.plans.length).toBeGreaterThanOrEqual(1);
    expect(typeof state.activePlanId).toBe('string');
  });

  it('migre les anciennes données v1', () => {
    const legacy = {
      members: [member('a1', 'Alice')],
      blocks: {
        ...createEmptyBlocks(),
        2: { person1: 'a1', person2: null },
      },
    };
    memory.set(STORAGE_KEY_V1, JSON.stringify(legacy));
    const state = loadState();
    expect(state.members[0]?.name).toBe('Alice');
    expect(state.plans[0]?.assignments[2]?.person1).toBe('a1');
    expect(memory.has(STORAGE_KEY_V2)).toBe(true);
  });

  it('persiste et recharge un état valide', () => {
    let state = createInitialAppState();
    const added = addMemberToDirectory(state, 'Bob');
    expect(added.ok).toBe(true);
    if (added.ok) state = added.state;
    saveState(state);
    const reloaded = loadState();
    expect(reloaded.members.some((m) => m.name === 'Bob')).toBe(true);
  });
});

describe('restoreGlobalBackup', () => {
  it('refuse un JSON malformé', () => {
    const current = createInitialAppState();
    const result = restoreGlobalBackup('pas du json {', current);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/JSON/i);
  });

  it('refuse un payload non reconnu', () => {
    const current = createInitialAppState();
    const result = restoreGlobalBackup(JSON.stringify({ foo: 1 }), current);
    expect(result.ok).toBe(false);
  });

  it('restaure une sauvegarde valide', () => {
    let state = createInitialAppState();
    {
      const added = addMemberToDirectory(state, 'Carla');
      if (added.ok) state = added.state;
    }
    state = addBlankPlan(state, { title: 'Restauré', date: '2026-09-01' });
    saveState(state);
    const raw = memory.get(STORAGE_KEY_V2)!;
    // Enveloppe type backup globale
    const envelope = JSON.stringify({
      version: 2,
      type: 'cite-royale-backup',
      state: JSON.parse(raw),
    });
    const empty = createInitialAppState();
    const result = restoreGlobalBackup(envelope, empty);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.members.some((m) => m.name === 'Carla')).toBe(true);
    expect(result.state.plans.some((p) => p.title === 'Restauré')).toBe(true);
  });
});

describe('suppression membre affecté / statut', () => {
  it('libère les places d’un membre supprimé', () => {
    let state: AppState = {
      ...createInitialAppState(),
      members: [member('x', 'Xénia')],
    };
    state = setActiveAssignment(state, 7, 'person1', 'x');
    state = removeMemberFromApp(state, 'x');
    expect(state.members).toHaveLength(0);
    expect(state.plans[0]?.assignments[7]?.person1).toBeNull();
  });

  it('verrouille puis autorise la réouverture via statut', () => {
    let state = createInitialAppState();
    const id = state.activePlanId!;
    state = setPlanStatus(state, id, 'finalized');
    expect(state.plans.find((p) => p.id === id)?.status).toBe('finalized');
    state = setPlanStatus(state, id, 'draft');
    expect(state.plans.find((p) => p.id === id)?.status).toBe('draft');
  });
});
