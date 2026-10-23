import { BLOCK_IDS, createEmptyBlocks } from '../data/blocks';
import type {
  AppState,
  BlockAssignment,
  Member,
  PlacementPlan,
  PlacementWorkspace,
  PlanStatus,
  SlotKey,
} from '../types';
import { countPlaced, createId, sanitizeAssignments, sanitizeMembers } from './placement';

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatPlanLabel(plan: PlacementPlan): string {
  const dateLabel = plan.date
    ? new Date(plan.date + 'T12:00:00').toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Sans date';
  return `${plan.title} — ${dateLabel}`;
}

export function statusLabel(status: PlanStatus): string {
  if (status === 'draft') return 'Brouillon';
  if (status === 'finalized') return 'Finalisé';
  return 'Archivé';
}

export function isPlanEditable(plan: PlacementPlan | null | undefined): boolean {
  return plan?.status === 'draft';
}

export function createPlan(options: {
  date?: string;
  title?: string;
  assignments?: Record<number, BlockAssignment>;
  status?: PlanStatus;
}): PlacementPlan {
  const stamp = nowIso();
  return {
    id: createId(),
    date: options.date ?? todayDateInput(),
    title: (options.title ?? 'Nouveau planning').trim() || 'Nouveau planning',
    status: options.status ?? 'draft',
    assignments: cloneAssignments(
      options.assignments ?? createEmptyBlocks(),
    ),
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function cloneAssignments(
  source: Record<number, BlockAssignment>,
): Record<number, BlockAssignment> {
  const next = createEmptyBlocks();
  for (const id of BLOCK_IDS) {
    const a = source[id];
    next[id] = a
      ? { person1: a.person1, person2: a.person2 }
      : { person1: null, person2: null };
  }
  return next;
}

export function createInitialAppState(): AppState {
  const plan = createPlan({
    title: 'Planning initial',
    date: todayDateInput(),
  });
  return {
    members: [],
    plans: [plan],
    activePlanId: plan.id,
  };
}

export function getActivePlan(state: AppState): PlacementPlan | null {
  if (!state.activePlanId) return state.plans[0] ?? null;
  return state.plans.find((p) => p.id === state.activePlanId) ?? state.plans[0] ?? null;
}

export function getActiveBlocks(
  state: AppState,
): Record<number, BlockAssignment> {
  const plan = getActivePlan(state);
  return plan ? plan.assignments : createEmptyBlocks();
}

export function getWorkspace(state: AppState): PlacementWorkspace {
  return {
    members: state.members,
    blocks: getActiveBlocks(state),
  };
}

export function touchPlan(plan: PlacementPlan): PlacementPlan {
  return { ...plan, updatedAt: nowIso() };
}

export function commitWorkspace(
  state: AppState,
  workspace: PlacementWorkspace,
): AppState {
  const active = getActivePlan(state);
  if (!active) {
    const plan = createPlan({
      assignments: workspace.blocks,
    });
    return {
      members: workspace.members,
      plans: [plan],
      activePlanId: plan.id,
    };
  }

  return {
    members: workspace.members,
    activePlanId: active.id,
    plans: state.plans.map((p) =>
      p.id === active.id
        ? touchPlan({
            ...p,
            assignments: cloneAssignments(workspace.blocks),
          })
        : p,
    ),
  };
}

export function selectPlan(state: AppState, planId: string): AppState {
  if (!state.plans.some((p) => p.id === planId)) return state;
  return { ...state, activePlanId: planId };
}

export function addBlankPlan(
  state: AppState,
  options: { date?: string; title?: string } = {},
): AppState {
  const plan = createPlan(options);
  return {
    ...state,
    plans: [...state.plans, plan],
    activePlanId: plan.id,
  };
}

export function duplicatePlan(
  state: AppState,
  sourcePlanId: string,
  options: { date?: string; title?: string } = {},
): AppState {
  const source = state.plans.find((p) => p.id === sourcePlanId);
  if (!source) return state;
  const plan = createPlan({
    date: options.date ?? source.date,
    title:
      options.title ??
      `${source.title.replace(/ \(copie.*\)$/i, '')} (copie)`,
    assignments: source.assignments,
    status: 'draft',
  });
  return {
    ...state,
    plans: [...state.plans, plan],
    activePlanId: plan.id,
  };
}

export function renamePlan(
  state: AppState,
  planId: string,
  title: string,
): AppState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.id === planId ? touchPlan({ ...p, title: trimmed }) : p,
    ),
  };
}

export function setPlanDate(
  state: AppState,
  planId: string,
  date: string,
): AppState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return state;
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.id === planId ? touchPlan({ ...p, date }) : p,
    ),
  };
}

export function setPlanStatus(
  state: AppState,
  planId: string,
  status: PlanStatus,
): AppState {
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.id === planId ? touchPlan({ ...p, status }) : p,
    ),
  };
}

export function reopenPlan(state: AppState, planId: string): AppState {
  return setPlanStatus(state, planId, 'draft');
}

export function deletePlan(state: AppState, planId: string): AppState {
  const remaining = state.plans.filter((p) => p.id !== planId);
  if (remaining.length === 0) {
    const plan = createPlan({ title: 'Nouveau planning' });
    return {
      ...state,
      plans: [plan],
      activePlanId: plan.id,
    };
  }
  const activePlanId =
    state.activePlanId === planId
      ? remaining[0]!.id
      : state.activePlanId && remaining.some((p) => p.id === state.activePlanId)
        ? state.activePlanId
        : remaining[0]!.id;
  return { ...state, plans: remaining, activePlanId };
}

export function countMemberAssignments(
  state: AppState,
  memberId: string,
): number {
  let n = 0;
  for (const plan of state.plans) {
    for (const id of BLOCK_IDS) {
      const a = plan.assignments[id];
      if (!a) continue;
      if (a.person1 === memberId || a.person2 === memberId) n += 1;
    }
  }
  return n;
}

/** Supprime un membre de l’annuaire et de toutes les affectations. */
export function removeMemberFromApp(
  state: AppState,
  memberId: string,
): AppState {
  return {
    members: state.members.filter((m) => m.id !== memberId),
    activePlanId: state.activePlanId,
    plans: state.plans.map((plan) => {
      let changed = false;
      const assignments = cloneAssignments(plan.assignments);
      for (const id of BLOCK_IDS) {
        const a = assignments[id]!;
        if (a.person1 === memberId) {
          a.person1 = null;
          changed = true;
        }
        if (a.person2 === memberId) {
          a.person2 = null;
          changed = true;
        }
      }
      return changed ? touchPlan({ ...plan, assignments }) : plan;
    }),
  };
}

export function addMemberToDirectory(
  state: AppState,
  name: string,
): { ok: true; state: AppState; memberId: string } | { ok: false; error: string; state: AppState } {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, error: 'Veuillez saisir un nom.', state };
  }
  const exists = state.members.some(
    (m) => m.name.toLocaleLowerCase('fr') === trimmed.toLocaleLowerCase('fr'),
  );
  if (exists) {
    return {
      ok: false,
      error: `Le membre « ${trimmed} » existe déjà.`,
      state,
    };
  }
  const member: Member = { id: createId(), name: trimmed };
  return {
    ok: true,
    memberId: member.id,
    state: { ...state, members: [...state.members, member] },
  };
}

export function sanitizeAppState(raw: unknown): AppState {
  const base = createInitialAppState();
  if (!raw || typeof raw !== 'object') return base;

  const data = raw as Record<string, unknown>;
  const members = sanitizeMembers(
    Array.isArray(data.members) ? (data.members as Member[]) : [],
  );
  const validIds = new Set(members.map((m) => m.id));

  let plans: PlacementPlan[] = [];
  if (Array.isArray(data.plans)) {
    for (const item of data.plans) {
      const plan = sanitizePlan(item, validIds);
      if (plan) plans.push(plan);
    }
  }

  if (plans.length === 0) {
    plans = [
      createPlan({
        title: 'Planning migré',
        assignments: sanitizeAssignments(
          (data as { blocks?: Record<number, BlockAssignment> }).blocks,
          validIds,
        ),
      }),
    ];
  }

  let activePlanId =
    typeof data.activePlanId === 'string' ? data.activePlanId : null;
  if (!activePlanId || !plans.some((p) => p.id === activePlanId)) {
    activePlanId = plans[0]!.id;
  }

  return { members, plans, activePlanId };
}

function sanitizePlan(
  raw: unknown,
  validIds: Set<string>,
): PlacementPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || !p.id) return null;
  const status: PlanStatus =
    p.status === 'finalized' || p.status === 'archived' || p.status === 'draft'
      ? p.status
      : 'draft';
  const date =
    typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date)
      ? p.date
      : todayDateInput();
  const title =
    typeof p.title === 'string' && p.title.trim()
      ? p.title.trim()
      : 'Planning';
  const createdAt =
    typeof p.createdAt === 'string' ? p.createdAt : nowIso();
  const updatedAt =
    typeof p.updatedAt === 'string' ? p.updatedAt : createdAt;

  return {
    id: p.id,
    date,
    title,
    status,
    assignments: sanitizeAssignments(
      p.assignments as Record<number, BlockAssignment> | undefined,
      validIds,
    ),
    createdAt,
    updatedAt,
  };
}

export function migrateLegacyState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, unknown>;
  // Already v2 shape
  if (Array.isArray(data.plans)) {
    return sanitizeAppState(data);
  }
  // v1 shape: { members, blocks }
  if (!Array.isArray(data.members) && !data.blocks) return null;
  const members = sanitizeMembers(
    Array.isArray(data.members) ? (data.members as Member[]) : [],
  );
  const validIds = new Set(members.map((m) => m.id));
  const assignments = sanitizeAssignments(
    data.blocks as Record<number, BlockAssignment> | undefined,
    validIds,
  );
  const plan = createPlan({
    title: 'Planning importé',
    date: todayDateInput(),
    assignments,
    status: 'draft',
  });
  return {
    members,
    plans: [plan],
    activePlanId: plan.id,
  };
}

export function validateBackupPayload(raw: unknown): {
  ok: true;
  state: AppState;
} | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Fichier de sauvegarde invalide.' };
  }
  const data = raw as Record<string, unknown>;
  const hasEnvelope =
    data.type === 'cite-royale-backup' ||
    data.version === 2 ||
    (data.state != null && typeof data.state === 'object');
  const payload =
    data.state && typeof data.state === 'object'
      ? (data.state as Record<string, unknown>)
      : data;

  const looksLikeAppState =
    Array.isArray(payload.members) && Array.isArray(payload.plans);

  if (!hasEnvelope && !looksLikeAppState) {
    return {
      ok: false,
      error: 'Ce fichier n’est pas une sauvegarde Cité Royale reconnue.',
    };
  }

  if (!looksLikeAppState) {
    return { ok: false, error: 'Structure de sauvegarde incomplète.' };
  }

  try {
    const state = sanitizeAppState(payload);
    if (state.plans.length === 0) {
      return { ok: false, error: 'Aucun planning dans la sauvegarde.' };
    }
    return { ok: true, state };
  } catch {
    return { ok: false, error: 'Impossible de valider la sauvegarde.' };
  }
}

export function buildGlobalBackup(state: AppState): string {
  return JSON.stringify(
    {
      version: 2,
      exportedAt: nowIso(),
      type: 'cite-royale-backup',
      state: sanitizeAppState(state),
    },
    null,
    2,
  );
}

export function planPlacementCount(plan: PlacementPlan): number {
  return countPlaced(plan.assignments);
}

export type LockedMutationResult = {
  ok: false;
  error: string;
  code: 'plan_locked' | 'no_active_plan';
  state: AppState;
};

export function ensureEditable(
  state: AppState,
): { ok: true; plan: PlacementPlan } | LockedMutationResult {
  const plan = getActivePlan(state);
  if (!plan) {
    return {
      ok: false,
      code: 'no_active_plan',
      error: 'Aucun planning actif.',
      state,
    };
  }
  if (!isPlanEditable(plan)) {
    return {
      ok: false,
      code: 'plan_locked',
      error: `Le planning « ${plan.title} » est ${statusLabel(plan.status).toLowerCase()} et ne peut pas être modifié.`,
      state,
    };
  }
  return { ok: true, plan };
}

/** Met à jour un emplacement du planning actif (utilitaire tests / internes). */
export function setActiveAssignment(
  state: AppState,
  blockId: number,
  slot: SlotKey,
  memberId: string | null,
): AppState {
  const plan = getActivePlan(state);
  if (!plan) return state;
  const assignments = cloneAssignments(plan.assignments);
  if (!assignments[blockId]) return state;
  assignments[blockId] = { ...assignments[blockId]!, [slot]: memberId };
  return {
    ...state,
    plans: state.plans.map((p) =>
      p.id === plan.id ? touchPlan({ ...p, assignments }) : p,
    ),
  };
}
