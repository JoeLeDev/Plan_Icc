import { describe, expect, it } from 'vitest';
import { createEmptyBlocks } from '../data/blocks';
import type { Member } from '../types';
import { assignMemberToSlot } from './placement';
import {
  addBlankPlan,
  addMemberToDirectory,
  buildGlobalBackup,
  commitWorkspace,
  createInitialAppState,
  deletePlan,
  duplicatePlan,
  ensureEditable,
  getActiveBlocks,
  getActivePlan,
  getWorkspace,
  isPlanEditable,
  migrateLegacyState,
  removeMemberFromApp,
  renamePlan,
  reopenPlan,
  selectPlan,
  setPlanDate,
  setPlanStatus,
  validateBackupPayload,
} from './plans';

function member(id: string, name: string): Member {
  return { id, name };
}

describe('create / duplicate / select plans', () => {
  it('crée un planning vierge et le sélectionne', () => {
    const base = createInitialAppState();
    const next = addBlankPlan(base, {
      title: 'Culte A',
      date: '2026-10-19',
    });
    expect(next.plans).toHaveLength(2);
    const active = getActivePlan(next);
    expect(active?.title).toBe('Culte A');
    expect(active?.date).toBe('2026-10-19');
    expect(active?.status).toBe('draft');
    expect(Object.values(active!.assignments).every((a) => !a.person1 && !a.person2)).toBe(
      true,
    );
  });

  it('duplique les affectations sans lier les plannings', () => {
    let state = createInitialAppState();
    state = {
      ...state,
      members: [member('a1', 'Alice')],
    };
    const ws = getWorkspace(state);
    const assigned = assignMemberToSlot(ws, 'a1', 1, 'person1');
    state = commitWorkspace(state, assigned.state);

    const sourceId = state.activePlanId!;
    state = duplicatePlan(state, sourceId, {
      title: 'Copie',
      date: '2026-11-01',
    });

    expect(state.plans).toHaveLength(2);
    const copy = getActivePlan(state)!;
    expect(copy.title).toBe('Copie');
    expect(copy.assignments[1]?.person1).toBe('a1');

    // Modifier la copie n’altère pas l’original
    const cleared = commitWorkspace(state, {
      members: state.members,
      blocks: createEmptyBlocks(),
    });
    const original = cleared.plans.find((p) => p.id === sourceId)!;
    expect(original.assignments[1]?.person1).toBe('a1');
    expect(getActiveBlocks(cleared)[1]?.person1).toBeNull();
  });

  it('permet de sélectionner un autre planning', () => {
    let state = createInitialAppState();
    state = addBlankPlan(state, { title: 'B', date: '2026-10-20' });
    const secondId = state.activePlanId!;
    const firstId = state.plans.find((p) => p.id !== secondId)!.id;
    state = selectPlan(state, firstId);
    expect(state.activePlanId).toBe(firstId);
  });
});

describe('indépendance et suppression', () => {
  it('supprime un planning avec conservation de l’annuaire', () => {
    let state = createInitialAppState();
    {
      const added = addMemberToDirectory(state, 'Alice');
      expect(added.ok).toBe(true);
      if (added.ok) state = added.state;
    }
    state = addBlankPlan(state, { title: 'Temp' });
    const toDelete = state.activePlanId!;
    state = deletePlan(state, toDelete);
    expect(state.plans.every((p) => p.id !== toDelete)).toBe(true);
    expect(state.members.some((m) => m.name === 'Alice')).toBe(true);
  });

  it('supprime un membre de tous les plannings', () => {
    let state = createInitialAppState();
    state = {
      ...state,
      members: [member('a1', 'Alice')],
    };
    state = commitWorkspace(state, {
      members: state.members,
      blocks: { ...getActiveBlocks(state), 3: { person1: 'a1', person2: null } },
    });
    state = addBlankPlan(state, { title: 'Autre' });
    state = commitWorkspace(state, {
      members: state.members,
      blocks: { ...getActiveBlocks(state), 5: { person1: 'a1', person2: null } },
    });

    state = removeMemberFromApp(state, 'a1');
    expect(state.members).toHaveLength(0);
    for (const plan of state.plans) {
      for (const a of Object.values(plan.assignments)) {
        expect(a.person1).not.toBe('a1');
        expect(a.person2).not.toBe('a1');
      }
    }
  });
});

describe('statuts et verrouillage', () => {
  it('change le statut et verrouille les finalisés', () => {
    let state = createInitialAppState();
    const id = state.activePlanId!;
    state = setPlanStatus(state, id, 'finalized');
    expect(getActivePlan(state)?.status).toBe('finalized');
    expect(isPlanEditable(getActivePlan(state))).toBe(false);
    expect(ensureEditable(state).ok).toBe(false);

    state = reopenPlan(state, id);
    expect(getActivePlan(state)?.status).toBe('draft');
    expect(ensureEditable(state).ok).toBe(true);

    state = setPlanStatus(state, id, 'archived');
    expect(ensureEditable(state).ok).toBe(false);
  });

  it('renomme et change la date', () => {
    let state = createInitialAppState();
    const id = state.activePlanId!;
    state = renamePlan(state, id, 'Dimanche');
    state = setPlanDate(state, id, '2026-12-25');
    expect(getActivePlan(state)?.title).toBe('Dimanche');
    expect(getActivePlan(state)?.date).toBe('2026-12-25');
  });
});

describe('migration et restauration', () => {
  it('migre les anciennes données v1', () => {
    const legacy = {
      members: [member('a1', 'Alice')],
      blocks: {
        ...createEmptyBlocks(),
        1: { person1: 'a1', person2: null },
      },
    };
    const migrated = migrateLegacyState(legacy);
    expect(migrated).not.toBeNull();
    expect(migrated!.members).toHaveLength(1);
    expect(migrated!.plans).toHaveLength(1);
    expect(migrated!.plans[0]!.assignments[1]?.person1).toBe('a1');
  });

  it('valide une sauvegarde globale et refuse un payload invalide', () => {
    const state = createInitialAppState();
    const backup = JSON.parse(buildGlobalBackup(state));
    const ok = validateBackupPayload(backup);
    expect(ok.ok).toBe(true);

    const bad = validateBackupPayload({ foo: 1 });
    expect(bad.ok).toBe(false);
  });

  it('restaure correctement après rechargement (sanitize)', () => {
    let state = createInitialAppState();
    {
      const added = addMemberToDirectory(state, 'Bob');
      expect(added.ok).toBe(true);
      if (added.ok) state = added.state;
    }
    state = addBlankPlan(state, { title: 'Persisté', date: '2026-10-18' });
    const backup = JSON.parse(buildGlobalBackup(state));
    const restored = validateBackupPayload(backup);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.state.members.some((m) => m.name === 'Bob')).toBe(true);
    expect(restored.state.plans.some((p) => p.title === 'Persisté')).toBe(true);
  });
});
