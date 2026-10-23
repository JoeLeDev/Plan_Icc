import * as XLSX from 'xlsx';
import { BLOCK_IDS, createEmptyBlocks } from '../data/blocks';
import type { AppState, Member, SlotKey } from '../types';
import {
  assignMemberToSlot,
  createId,
  findMemberByName,
} from './placement';
import {
  cloneAssignments,
  commitWorkspace,
  ensureEditable,
  getActivePlan,
  getWorkspace,
  planPlacementCount,
  touchPlan,
} from './plans';

type Row = Record<string, unknown>;

export type ImportMode = 'append' | 'replace';

export type ImportCandidateStatus =
  | 'ready'
  | 'duplicate_in_file'
  | 'exists_in_app'
  | 'missing_name'
  | 'invalid_block'
  | 'invalid_place'
  | 'placement_conflict'
  | 'header_skipped'
  | 'empty';

export type ImportCandidate = {
  rowIndex: number;
  /** Nom lu dans le fichier. */
  name: string;
  /** Nom effectivement enregistré (désambiguïsé si doublon). */
  importName: string;
  blockId: number | null;
  slot: SlotKey | null;
  status: ImportCandidateStatus;
  message?: string;
  /** Inclus dans l’import membres (hors lignes vides / en-têtes). */
  willImportMember: boolean;
  /** Préaffectation applicable si confirmée. */
  willAssign: boolean;
};

export type ImportPreview = {
  sheetNames: string[];
  sheetName: string;
  columns: string[];
  detected: {
    nameColumn: string | null;
    prenomColumn: string | null;
    fullNameColumn: string | null;
    blocColumn: string | null;
    placeColumn: string | null;
  };
  nameColumn: string | null;
  prenomColumn: string | null;
  blocColumn: string | null;
  placeColumn: string | null;
  candidates: ImportCandidate[];
  ignoredRows: { rowIndex: number; reason: string }[];
  errors: string[];
  stats: {
    memberCount: number;
    duplicateInFile: number;
    existsInApp: number;
    ignored: number;
    withPlacement: number;
    placementConflicts: number;
    invalidPlacements: number;
  };
};

export type ApplyImportResult = {
  ok: boolean;
  state: AppState;
  error?: string;
  summary: {
    membersAdded: number;
    membersSkipped: number;
    placementsApplied: number;
    placementsSkipped: number;
  };
};

const NAME_ALIASES = [
  'nom',
  'name',
  'membre',
  'noms',
  'nom de famille',
  'lastname',
  'last name',
];
const PRENOM_ALIASES = ['prenom', 'prénom', 'firstname', 'first name', 'prenoms'];
const FULL_NAME_ALIASES = [
  'nom complet',
  'fullname',
  'full name',
  'prenom nom',
  'prénom nom',
  'nom prenom',
  'nom et prenom',
  'nom et prénom',
  'participant',
  'personne',
];
const BLOC_ALIASES = [
  'bloc',
  'block',
  'zone',
  'numero',
  'numero bloc',
  'n° bloc',
  'n°',
];
const PLACE_ALIASES = [
  'place',
  'slot',
  'position',
  'emplacement',
  'place n',
  'n place',
  'n° place',
];

const HEADER_NAME_VALUES = new Set(
  [
    ...NAME_ALIASES,
    ...PRENOM_ALIASES,
    ...FULL_NAME_ALIASES,
    'nom',
    'prénom',
    'prenom',
    'name',
  ].map((s) => normalizeKey(s)),
);

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function cleanText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function findColumn(
  columns: string[],
  aliases: string[],
): string | null {
  const normalizedAliases = aliases.map((a) => normalizeKey(a));
  // Exact match first
  for (const alias of normalizedAliases) {
    const found = columns.find((c) => normalizeKey(c) === alias);
    if (found) return found;
  }
  // Column contains alias (e.g. "Nom du membre" contient "nom")
  for (const alias of normalizedAliases) {
    if (alias.length < 4) continue;
    const found = columns.find((c) => normalizeKey(c).includes(alias));
    if (found) return found;
  }
  return null;
}

function cell(row: Row, column: string | null | undefined): unknown {
  if (!column) return undefined;
  if (Object.prototype.hasOwnProperty.call(row, column)) return row[column];
  const target = normalizeKey(column);
  const entry = Object.entries(row).find(([k]) => normalizeKey(k) === target);
  return entry?.[1];
}

function isRowEmpty(row: Row): boolean {
  return Object.values(row).every((v) => cleanText(v) === '');
}

function parseBlockId(raw: unknown): { ok: true; value: number } | { ok: false; reason: string } | null {
  const text = cleanText(raw);
  if (!text) return null;
  const num = Number(text);
  if (!Number.isFinite(num) || !BLOCK_IDS.includes(num)) {
    return { ok: false, reason: `Bloc invalide « ${text} » (attendu 1–23).` };
  }
  return { ok: true, value: num };
}

function parseSlot(
  raw: unknown,
): { ok: true; value: SlotKey } | { ok: false; reason: string } | null {
  const text = cleanText(raw);
  if (!text) return null;
  const num = Number(text);
  if (num === 1) return { ok: true, value: 'person1' };
  if (num === 2) return { ok: true, value: 'person2' };
  const s = normalizeKey(text);
  if (s === '1' || s === 'a' || s === 'place 1' || s === 'emplacement 1') {
    return { ok: true, value: 'person1' };
  }
  if (s === '2' || s === 'b' || s === 'place 2' || s === 'emplacement 2') {
    return { ok: true, value: 'person2' };
  }
  return {
    ok: false,
    reason: `Place invalide « ${text} » (attendu 1 ou 2).`,
  };
}

function buildDisplayName(
  row: Row,
  nameColumn: string | null,
  prenomColumn: string | null,
  fullNameColumn: string | null,
): string {
  if (fullNameColumn) {
    return cleanText(cell(row, fullNameColumn));
  }
  const nom = cleanText(cell(row, nameColumn));
  const prenom = cleanText(cell(row, prenomColumn));
  if (prenom && nom) return `${prenom} ${nom}`;
  return nom || prenom;
}

export function listWorkbookSheets(data: ArrayBuffer): string[] {
  const workbook = XLSX.read(data, { type: 'array' });
  return workbook.SheetNames;
}

export function detectColumns(columns: string[]): ImportPreview['detected'] {
  const fullNameColumn = findColumn(columns, FULL_NAME_ALIASES);
  const nomOnly = findColumn(columns, NAME_ALIASES);
  const prenomOnly = findColumn(columns, PRENOM_ALIASES);

  if (fullNameColumn) {
    return {
      nameColumn: fullNameColumn,
      prenomColumn: null,
      fullNameColumn,
      blocColumn: findColumn(columns, BLOC_ALIASES),
      placeColumn: findColumn(columns, PLACE_ALIASES),
    };
  }

  return {
    nameColumn: nomOnly,
    prenomColumn: prenomOnly,
    fullNameColumn: null,
    blocColumn: findColumn(columns, BLOC_ALIASES),
    placeColumn: findColumn(columns, PLACE_ALIASES),
  };
}

export type BuildPreviewOptions = {
  data: ArrayBuffer;
  sheetName?: string;
  nameColumn?: string | null;
  prenomColumn?: string | null;
  blocColumn?: string | null;
  placeColumn?: string | null;
  existingMembers?: Member[];
};

export function buildImportPreview(
  options: BuildPreviewOptions,
): ImportPreview {
  const workbook = XLSX.read(options.data, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  const errors: string[] = [];

  if (sheetNames.length === 0) {
    return emptyPreview(sheetNames, '', [], errors.concat('Le fichier ne contient aucune feuille.'));
  }

  const sheetName =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0]!;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return emptyPreview(sheetNames, sheetName, [], errors.concat(`Feuille « ${sheetName} » introuvable.`));
  }

  const rows = XLSX.utils.sheet_to_json<Row>(sheet, {
    defval: '',
    raw: false,
  });
  const columns =
    rows.length > 0
      ? Object.keys(rows[0]!)
      : (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] as
          | string[]
          | undefined)?.map(String) ?? [];

  const detected = detectColumns(columns);

  const nameColumn =
    options.nameColumn !== undefined ? options.nameColumn : detected.nameColumn;
  const prenomColumn =
    options.prenomColumn !== undefined
      ? options.prenomColumn
      : detected.prenomColumn;
  const blocColumn =
    options.blocColumn !== undefined ? options.blocColumn : detected.blocColumn;
  const placeColumn =
    options.placeColumn !== undefined
      ? options.placeColumn
      : detected.placeColumn;

  const useFullNameOnly = Boolean(nameColumn) && !prenomColumn;

  if (!nameColumn && !prenomColumn) {
    errors.push(
      'Aucune colonne de nom détectée. Sélectionnez manuellement la colonne contenant les noms.',
    );
  }

  const existing = options.existingMembers ?? [];
  const takenNames = new Set(
    existing.map((m) => m.name.toLocaleLowerCase('fr')),
  );
  const firstSeenRow = new Map<string, number>();
  const fileNameCounts = new Map<string, number>();
  const slotOccupancy = new Map<string, number>();

  const candidates: ImportCandidate[] = [];
  const ignoredRows: { rowIndex: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 2; // header = row 1 in Excel
    if (isRowEmpty(row)) {
      ignoredRows.push({ rowIndex, reason: 'Ligne vide' });
      candidates.push({
        rowIndex,
        name: '',
        importName: '',
        blockId: null,
        slot: null,
        status: 'empty',
        message: 'Ligne vide',
        willImportMember: false,
        willAssign: false,
      });
      return;
    }

    const name = buildDisplayName(
      row,
      useFullNameOnly ? null : nameColumn,
      prenomColumn,
      useFullNameOnly ? nameColumn : null,
    );

    if (!name) {
      ignoredRows.push({ rowIndex, reason: 'Nom manquant' });
      candidates.push({
        rowIndex,
        name: '',
        importName: '',
        blockId: null,
        slot: null,
        status: 'missing_name',
        message: 'Nom manquant',
        willImportMember: false,
        willAssign: false,
      });
      return;
    }

    if (HEADER_NAME_VALUES.has(normalizeKey(name))) {
      ignoredRows.push({ rowIndex, reason: 'En-tête détecté' });
      candidates.push({
        rowIndex,
        name,
        importName: '',
        blockId: null,
        slot: null,
        status: 'header_skipped',
        message: 'En-tête ignoré',
        willImportMember: false,
        willAssign: false,
      });
      return;
    }

    const nameKey = name.toLocaleLowerCase('fr');
    const previousRow = firstSeenRow.get(nameKey);
    const existsInApp = takenNames.has(nameKey);
    const occurrence = (fileNameCounts.get(nameKey) ?? 0) + 1;
    fileNameCounts.set(nameKey, occurrence);

    let status: ImportCandidateStatus = 'ready';
    let message: string | undefined;
    let willImportMember = true;
    let importName = name;

    if (previousRow != null) {
      status = 'duplicate_in_file';
      importName = uniqueImportName(name, takenNames);
      message = `Doublon potentiel (ligne ${previousRow}) — importé distinctement comme « ${importName} »`;
      takenNames.add(importName.toLocaleLowerCase('fr'));
    } else if (existsInApp) {
      status = 'exists_in_app';
      message =
        'Déjà présent dans l’application — non réimporté, pas de fusion';
      willImportMember = false;
      firstSeenRow.set(nameKey, rowIndex);
    } else {
      firstSeenRow.set(nameKey, rowIndex);
      takenNames.add(nameKey);
    }

    const blocRaw = cell(row, blocColumn);
    const placeRaw = cell(row, placeColumn);

    let blockId: number | null = null;
    let slot: SlotKey | null = null;
    let willAssign = false;

    const blocParsed = parseBlockId(blocRaw);
    const placeParsed = parseSlot(placeRaw);

    if (blocParsed === null && placeParsed === null) {
      // pas de préaffectation
    } else if (blocParsed === null && placeParsed !== null) {
      status = 'invalid_block';
      message = appendMessage(message, 'Place renseignée sans numéro de bloc');
      willAssign = false;
    } else if (blocParsed && !blocParsed.ok) {
      status = 'invalid_block';
      message = appendMessage(message, blocParsed.reason);
      willAssign = false;
    } else if (blocParsed && blocParsed.ok && placeParsed === null) {
      blockId = blocParsed.value;
      if (status === 'ready' || status === 'duplicate_in_file') {
        status = 'invalid_place';
      }
      message = appendMessage(
        message,
        'Bloc renseigné sans place (1 ou 2) — préaffectation ignorée',
      );
      willAssign = false;
    } else if (
      blocParsed &&
      blocParsed.ok &&
      placeParsed &&
      !placeParsed.ok
    ) {
      blockId = blocParsed.value;
      status = 'invalid_place';
      message = appendMessage(message, placeParsed.reason);
      willAssign = false;
    } else if (
      blocParsed &&
      blocParsed.ok &&
      placeParsed &&
      placeParsed.ok
    ) {
      blockId = blocParsed.value;
      slot = placeParsed.value;
      const key = `${blockId}:${slot}`;
      const conflictRow = slotOccupancy.get(key);
      if (conflictRow != null) {
        status = 'placement_conflict';
        message = appendMessage(
          message,
          `Conflit : bloc ${blockId} place ${slot === 'person1' ? 1 : 2} déjà prévu ligne ${conflictRow}`,
        );
        willAssign = false;
      } else if (!willImportMember) {
        willAssign = false;
        message = appendMessage(
          message,
          'Préaffectation non appliquée (pas de fusion)',
        );
      } else {
        slotOccupancy.set(key, rowIndex);
        willAssign = true;
      }
    }

    candidates.push({
      rowIndex,
      name,
      importName: willImportMember ? importName : name,
      blockId,
      slot,
      status,
      message,
      willImportMember,
      willAssign,
    });
  });

  if (rows.length === 0) {
    errors.push('La feuille sélectionnée ne contient aucune donnée.');
  }

  const importable = candidates.filter((c) => c.willImportMember);
  const stats = {
    memberCount: importable.length,
    duplicateInFile: candidates.filter((c) => c.status === 'duplicate_in_file')
      .length,
    existsInApp: candidates.filter((c) => c.status === 'exists_in_app').length,
    ignored: ignoredRows.length,
    withPlacement: candidates.filter((c) => c.willAssign).length,
    placementConflicts: candidates.filter(
      (c) => c.status === 'placement_conflict',
    ).length,
    invalidPlacements: candidates.filter(
      (c) =>
        c.status === 'invalid_block' ||
        c.status === 'invalid_place' ||
        c.status === 'placement_conflict',
    ).length,
  };

  return {
    sheetNames,
    sheetName,
    columns,
    detected,
    nameColumn,
    prenomColumn,
    blocColumn,
    placeColumn,
    candidates,
    ignoredRows,
    errors,
    stats,
  };
}

function appendMessage(base: string | undefined, next: string): string {
  return base ? `${base}. ${next}` : next;
}

function uniqueImportName(base: string, taken: Set<string>): string {
  let i = 2;
  let candidate = `${base} (${i})`;
  while (taken.has(candidate.toLocaleLowerCase('fr'))) {
    i += 1;
    candidate = `${base} (${i})`;
  }
  return candidate;
}

function emptyPreview(
  sheetNames: string[],
  sheetName: string,
  columns: string[],
  errors: string[],
): ImportPreview {
  return {
    sheetNames,
    sheetName,
    columns,
    detected: {
      nameColumn: null,
      prenomColumn: null,
      fullNameColumn: null,
      blocColumn: null,
      placeColumn: null,
    },
    nameColumn: null,
    prenomColumn: null,
    blocColumn: null,
    placeColumn: null,
    candidates: [],
    ignoredRows: [],
    errors,
    stats: {
      memberCount: 0,
      duplicateInFile: 0,
      existsInApp: 0,
      ignored: 0,
      withPlacement: 0,
      placementConflicts: 0,
      invalidPlacements: 0,
    },
  };
}

export function applyExcelImport(
  state: AppState,
  preview: ImportPreview,
  mode: ImportMode,
): ApplyImportResult {
  if (preview.errors.length && preview.stats.memberCount === 0) {
    return {
      ok: false,
      state,
      error: preview.errors[0],
      summary: {
        membersAdded: 0,
        membersSkipped: 0,
        placementsApplied: 0,
        placementsSkipped: 0,
      },
    };
  }

  const editable = ensureEditable(state);
  const canAssign = editable.ok;

  let next: AppState =
    mode === 'replace'
      ? {
          members: [],
          plans: state.plans.map((p) =>
            touchPlan({
              ...p,
              assignments: createEmptyBlocks(),
            }),
          ),
          activePlanId: state.activePlanId,
        }
      : {
          members: [...state.members],
          plans: state.plans.map((p) => ({
            ...p,
            assignments: cloneAssignments(p.assignments),
          })),
          activePlanId: state.activePlanId,
        };

  let workspace = getWorkspace(next);

  let membersAdded = 0;
  let membersSkipped = 0;
  let placementsApplied = 0;
  let placementsSkipped = 0;

  for (const candidate of preview.candidates) {
    if (!candidate.willImportMember) {
      if (
        candidate.status !== 'empty' &&
        candidate.status !== 'header_skipped' &&
        candidate.status !== 'missing_name'
      ) {
        membersSkipped += 1;
      }
      if (candidate.blockId != null || candidate.slot != null) {
        placementsSkipped += 1;
      }
      continue;
    }

    if (findMemberByName(workspace.members, candidate.importName || candidate.name)) {
      membersSkipped += 1;
      continue;
    }

    const member: Member = {
      id: createId(),
      name: candidate.importName || candidate.name,
    };
    workspace = {
      ...workspace,
      members: [...workspace.members, member],
    };
    membersAdded += 1;

    if (candidate.willAssign && candidate.blockId != null && candidate.slot) {
      if (!canAssign) {
        placementsSkipped += 1;
        continue;
      }
      const target = workspace.blocks[candidate.blockId];
      if (target?.[candidate.slot]) {
        placementsSkipped += 1;
        continue;
      }
      const result = assignMemberToSlot(
        workspace,
        member.id,
        candidate.blockId,
        candidate.slot,
        { confirmMove: true },
      );
      if (result.ok) {
        workspace = result.state;
        placementsApplied += 1;
      } else {
        placementsSkipped += 1;
      }
    }
  }

  next = commitWorkspace(
    { ...next, members: workspace.members },
    workspace,
  );

  return {
    ok: true,
    state: next,
    summary: {
      membersAdded,
      membersSkipped,
      placementsApplied,
      placementsSkipped,
    },
  };
}

/** Impact d’un remplacement sur l’annuaire et les affectations. */
export function describeReplaceImpact(state: AppState): string {
  const members = state.members.length;
  const placed = state.plans.reduce(
    (sum, plan) => sum + planPlacementCount(plan),
    0,
  );
  if (members === 0 && placed === 0) {
    return 'Aucune donnée existante ne sera affectée.';
  }
  return `Cette action remplacera ${members} membre(s) de l’annuaire et effacera ${placed} affectation(s) sur ${state.plans.length} planning(s).`;
}

/** @deprecated Prefer buildImportPreview + applyExcelImport. */
export function importFromExcel(file: ArrayBuffer, state: AppState): AppState {
  const preview = buildImportPreview({
    data: file,
    existingMembers: state.members,
  });
  return applyExcelImport(state, preview, 'append').state;
}

export type ExcelPlacementRow = {
  Bloc: number;
  Niveau: string;
  'Personne 1': string;
  'Personne 2': string;
};

export type ExcelInfoRow = {
  Titre: string;
  Date: string;
  Statut: string;
  'Exporté le': string;
  Membres: number;
  Places: string;
};

/** Construit le classeur Excel du planning actif (testable, sans écriture disque). */
export function buildExcelWorkbook(state: AppState): XLSX.WorkBook {
  const plan = getActivePlan(state);
  const blocks = plan?.assignments ?? createEmptyBlocks();
  const rows: ExcelPlacementRow[] = BLOCK_IDS.map((blockId) => {
    const a = blocks[blockId]!;
    const p1 = state.members.find((m) => m.id === a.person1)?.name ?? '';
    const p2 = state.members.find((m) => m.id === a.person2)?.name ?? '';
    return {
      Bloc: blockId,
      Niveau: blockId <= 13 ? 'RDC' : 'Mezzanine',
      'Personne 1': p1,
      'Personne 2': p2,
    };
  });

  const placed = rows.reduce(
    (n, r) => n + (r['Personne 1'] ? 1 : 0) + (r['Personne 2'] ? 1 : 0),
    0,
  );

  const info: ExcelInfoRow[] = [
    {
      Titre: plan?.title ?? 'Planning',
      Date: plan?.date ?? '',
      Statut: plan?.status ?? 'draft',
      'Exporté le': new Date().toISOString(),
      Membres: state.members.length,
      Places: `${placed}/46`,
    },
  ];

  const unplaced = state.members.filter((m) => {
    return !Object.values(blocks).some(
      (a) => a.person1 === m.id || a.person2 === m.id,
    );
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(info), 'Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Placements');

  if (unplaced.length) {
    const ws2 = XLSX.utils.json_to_sheet(
      unplaced.map((m) => ({ Nom: m.name })),
    );
    XLSX.utils.book_append_sheet(wb, ws2, 'Non places');
  }

  return wb;
}

export function exportToExcel(state: AppState): void {
  const plan = getActivePlan(state);
  const wb = buildExcelWorkbook(state);
  const suffix = plan?.date ?? 'planning';
  XLSX.writeFile(wb, `placements-cite-royale-${suffix}.xlsx`);
}

export function exportToJson(state: AppState): void {
  const plan = getActivePlan(state);
  const blocks = plan?.assignments ?? createEmptyBlocks();
  const payload = {
    exportedAt: new Date().toISOString(),
    type: 'cite-royale-plan-export',
    plan: plan
      ? {
          id: plan.id,
          date: plan.date,
          title: plan.title,
          status: plan.status,
        }
      : null,
    members: state.members,
    placements: BLOCK_IDS.map((blockId) => ({
      blockId,
      niveau: blockId <= 13 ? 'rdc' : 'mezzanine',
      person1:
        state.members.find((m) => m.id === blocks[blockId]?.person1)?.name ??
        null,
      person2:
        state.members.find((m) => m.id === blocks[blockId]?.person2)?.name ??
        null,
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `placements-cite-royale-${plan?.date ?? 'planning'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Helper tests / tooling : construit un ArrayBuffer xlsx en mémoire. */
export function workbookToArrayBuffer(
  sheets: Record<string, unknown[][]>,
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  if (out instanceof ArrayBuffer) return out;
  if (ArrayBuffer.isView(out)) {
    const view = out as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }
  return Uint8Array.from(out as number[]).buffer;
}
