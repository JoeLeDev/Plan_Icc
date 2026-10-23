export type Member = {
  id: string;
  name: string;
};

export type SlotKey = 'person1' | 'person2';

export type BlockAssignment = {
  person1: string | null;
  person2: string | null;
};

export type FloorLevel = 'rdc' | 'mezzanine';

export type PlanStatus = 'draft' | 'finalized' | 'archived';

export type PlacementPlan = {
  id: string;
  date: string;
  title: string;
  status: PlanStatus;
  assignments: Record<number, BlockAssignment>;
  createdAt: string;
  updatedAt: string;
};

export type AppState = {
  members: Member[];
  plans: PlacementPlan[];
  activePlanId: string | null;
};

/** Vue de travail pour les règles d’affectation (planning actif). */
export type PlacementWorkspace = {
  members: Member[];
  blocks: Record<number, BlockAssignment>;
};

export type SelectedSlot = {
  blockId: number;
  slot: SlotKey;
} | null;
