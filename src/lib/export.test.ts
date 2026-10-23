import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { BLOCK_IDS, createEmptyBlocks } from '../data/blocks';
import type { AppState, Member } from '../types';
import { buildExcelWorkbook } from './excel';
import {
  buildPdfDocument,
  buildSummaryPdfDocument,
  pdfPageCount,
} from './pdf';
import {
  addBlankPlan,
  createInitialAppState,
  getActivePlan,
  selectPlan,
  setActiveAssignment,
} from './plans';

function member(id: string, name: string): Member {
  return { id, name };
}

function seededState(): AppState {
  let state = createInitialAppState();
  const planId = state.activePlanId!;
  state = {
    ...state,
    members: [
      member('m1', 'José François'),
      member('m2', 'Amélie Dupont'),
      member('m3', 'Hélène'),
    ],
    plans: state.plans.map((p) =>
      p.id === planId
        ? {
            ...p,
            title: 'Sainte Cène — Culte spécial',
            date: '2026-10-19',
            assignments: {
              ...createEmptyBlocks(),
              1: { person1: 'm1', person2: 'm2' },
              14: { person1: 'm3', person2: null },
            },
          }
        : p,
    ),
  };
  return state;
}

describe('buildExcelWorkbook', () => {
  it('exporte 23 blocs avec 2 emplacements, date, titre et accents', () => {
    const state = seededState();
    const wb = buildExcelWorkbook(state);
    expect(wb.SheetNames).toContain('Info');
    expect(wb.SheetNames).toContain('Placements');

    const info = XLSX.utils.sheet_to_json<Record<string, string>>(
      wb.Sheets.Info!,
    );
    expect(info[0]?.Titre).toBe('Sainte Cène — Culte spécial');
    expect(info[0]?.Date).toBe('2026-10-19');

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets.Placements!,
    );
    expect(rows).toHaveLength(23);
    expect(rows.map((r) => r.Bloc)).toEqual([...BLOCK_IDS]);

    const bloc1 = rows.find((r) => r.Bloc === 1)!;
    expect(bloc1['Personne 1']).toBe('José François');
    expect(bloc1['Personne 2']).toBe('Amélie Dupont');
    expect(bloc1.Niveau).toBe('RDC');

    const bloc14 = rows.find((r) => r.Bloc === 14)!;
    expect(bloc14['Personne 1']).toBe('Hélène');
    expect(bloc14['Personne 2']).toBe('');
    expect(bloc14.Niveau).toBe('Mezzanine');
  });

  it('n’inclut pas les affectations d’un autre planning', () => {
    let state = seededState();
    state = addBlankPlan(state, {
      title: 'Autre culte',
      date: '2026-11-01',
    });
    // Planning actif = vierge ; l’autre a José au bloc 1
    const other = state.plans.find((p) => p.title.includes('Sainte'))!;
    expect(other.assignments[1]?.person1).toBe('m1');

    const wb = buildExcelWorkbook(state);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wb.Sheets.Placements!,
    );
    const bloc1 = rows.find((r) => r.Bloc === 1)!;
    expect(bloc1['Personne 1']).toBe('');
    expect(bloc1['Personne 2']).toBe('');

    const info = XLSX.utils.sheet_to_json<Record<string, string>>(
      wb.Sheets.Info!,
    );
    expect(info[0]?.Titre).toBe('Autre culte');
    expect(info[0]?.Date).toBe('2026-11-01');
  });
});

describe('buildPdfDocument (récap)', () => {
  it('produit un PDF A4 portrait avec RDC, mezzanine, date/titre et accents', () => {
    const state = seededState();
    const doc = buildSummaryPdfDocument(state);
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    expect(pdfPageCount(doc)).toBeGreaterThanOrEqual(1);

    const latin1 = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    expect(latin1).toContain('Cité Royale');
    expect(latin1).toContain('Sainte Cène');
    expect(latin1).toContain('Culte spécial');
    expect(latin1).toContain('RDC');
    expect(latin1).toContain('Mezzanine');
    expect(latin1).toContain('José François');
    expect(latin1).toContain('Amélie Dupont');
    expect(latin1).toContain('Hélène');
    expect(getActivePlan(state)!.title).toContain('Culte spécial');
  });

  it('cible le planning actif (titre / date), pas un autre planning', () => {
    let state = seededState();
    state = addBlankPlan(state, { title: 'Vierge', date: '2026-12-01' });
    const doc = buildPdfDocument(state);
    const latin1 = Buffer.from(doc.output('arraybuffer')).toString('latin1');
    expect(latin1).toContain('Vierge');
    expect(latin1).not.toContain('Culte spécial');
  });

  it('ne mute pas le planning lors de l’export récap', () => {
    const state = seededState();
    const before = JSON.stringify(state);
    buildSummaryPdfDocument(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('indépendance multi-planning (régression export)', () => {
  it('bascule de planning change le contenu exporté', () => {
    let state = createInitialAppState();
    state = {
      ...state,
      members: [member('a', 'Alice'), member('b', 'Bob')],
    };
    const planA = state.activePlanId!;
    state = setActiveAssignment(state, 3, 'person1', 'a');
    state = addBlankPlan(state, { title: 'Plan B', date: '2026-10-20' });
    const planB = state.activePlanId!;
    state = setActiveAssignment(state, 5, 'person1', 'b');

    state = selectPlan(state, planA);
    let rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      buildExcelWorkbook(state).Sheets.Placements!,
    );
    expect(rows.find((r) => r.Bloc === 3)?.['Personne 1']).toBe('Alice');
    expect(rows.find((r) => r.Bloc === 5)?.['Personne 1']).toBe('');

    state = selectPlan(state, planB);
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      buildExcelWorkbook(state).Sheets.Placements!,
    );
    expect(rows.find((r) => r.Bloc === 3)?.['Personne 1']).toBe('');
    expect(rows.find((r) => r.Bloc === 5)?.['Personne 1']).toBe('Bob');
  });
});
