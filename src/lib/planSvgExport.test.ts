import { describe, expect, it } from 'vitest';
import { MEZZANINE_GEOMETRY, RDC_GEOMETRY } from '../data/geometry';
import { createEmptyBlocks } from '../data/blocks';
import type { AppState, Member } from '../types';
import {
  addBlankPlan,
  createInitialAppState,
  setActiveAssignment,
} from './plans';
import {
  blockBounds,
  buildFloorPlanSvgMarkup,
  estimateTextWidth,
  extractLabeledNamesFromSvg,
  fitLabel,
} from './planSvgExport';
import { buildMezzaninePlanSvg, buildRdcPlanSvg } from './pdf';

function member(id: string, name: string): Member {
  return { id, name };
}

function seeded(): AppState {
  let state = createInitialAppState();
  const planId = state.activePlanId!;
  state = {
    ...state,
    members: [
      member('m1', 'José François'),
      member('m2', 'Amélie Dupont-Longuenom'),
      member('m3', 'Hélène'),
    ],
    plans: state.plans.map((p) =>
      p.id === planId
        ? {
            ...p,
            title: 'Culte accents',
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

describe('fitLabel / blockBounds', () => {
  it('réduit ou tronque les noms trop longs', () => {
    const long = 'Jean-Baptiste de La Fontaine Extraordinaire';
    const fitted = fitLabel(long, 70, 12, 7);
    expect(fitted.fontSize).toBeLessThanOrEqual(12);
    expect(estimateTextWidth(fitted.text, fitted.fontSize)).toBeLessThanOrEqual(
      72,
    );
  });

  it('calcule une bbox pour chaque bloc RDC / mezzanine', () => {
    for (const block of [...RDC_GEOMETRY.blocks, ...MEZZANINE_GEOMETRY.blocks]) {
      const b = blockBounds(block);
      expect(b.width).toBeGreaterThan(20);
      expect(b.height).toBeGreaterThan(20);
    }
  });
});

describe('buildFloorPlanSvgMarkup', () => {
  it('exporte RDC et mezzanine avec les bons noms et accents', () => {
    const state = seeded();
    const rdc = buildRdcPlanSvg(state);
    const mezz = buildMezzaninePlanSvg(state);

    expect(rdc).toContain('viewBox=');
    expect(rdc).toContain(RDC_GEOMETRY.floorPath.slice(0, 20));
    expect(mezz).toContain(MEZZANINE_GEOMETRY.floorPath.slice(0, 12));

    const rdcNames = extractLabeledNamesFromSvg(rdc);
    expect(rdcNames.some((n) => n.includes('José'))).toBe(true);
    expect(rdcNames.some((n) => n.includes('Amélie'))).toBe(true);

    const mezzNames = extractLabeledNamesFromSvg(mezz);
    expect(mezzNames).toContain('Hélène');
    expect(mezzNames.some((n) => n.includes('José'))).toBe(false);
  });

  it('marque les blocs vides sans inventer de noms', () => {
    const state = createInitialAppState();
    const svg = buildFloorPlanSvgMarkup(RDC_GEOMETRY, state, {
      title: 'Test vide',
      gradientId: 'g1',
    });
    expect(svg).toContain('Libre');
    // Aucun nom de membre inventé
    expect(extractLabeledNamesFromSvg(svg)).toEqual([]);
  });

  it('n’inclut pas les affectations d’un autre planning', () => {
    let state = seeded();
    state = addBlankPlan(state, { title: 'Vierge', date: '2026-11-01' });
    const rdc = buildRdcPlanSvg(state);
    const names = extractLabeledNamesFromSvg(rdc);
    expect(names.some((n) => n.includes('José'))).toBe(false);
    expect(rdc).toContain('Vierge');
  });

  it('préserve les polygones d’origine (pas de duplication de coords)', () => {
    const state = seeded();
    const svg = buildRdcPlanSvg(state);
    for (const block of RDC_GEOMETRY.blocks) {
      if (block.points) expect(svg).toContain(block.points);
    }
  });

  it('ne mute pas l’état pendant la construction SVG', () => {
    let state = seeded();
    state = setActiveAssignment(state, 5, 'person1', 'm1');
    const before = JSON.stringify(state);
    buildRdcPlanSvg(state);
    buildMezzaninePlanSvg(state);
    expect(JSON.stringify(state)).toBe(before);
  });
});
