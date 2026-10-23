import { occupancyClass, occupancyCount } from '../data/blocks';
import type { BlockShape, FloorGeometry } from '../data/geometry';
import type { AppState, BlockAssignment, Member } from '../types';
import { getMemberName } from './placement';
import { getActiveBlocks } from './plans';

const BLOCK_FILL = {
  empty: '#d5c6ef',
  partial: '#b79de0',
  full: '#8b6bc9',
} as const;

export type PlanSvgLevel = 'rdc' | 'mezzanine';

export type PlanSvgBuildOptions = {
  title: string;
  subtitle?: string;
  gradientId: string;
  accentFrom?: string;
  accentTo?: string;
};

/** Bounding box approximatif d’un polygone `points`. */
export function blockBounds(block: BlockShape): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
} {
  const pts = parsePoints(block);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) {
    return {
      minX: block.label.x - 40,
      minY: block.label.y - 40,
      maxX: block.label.x + 40,
      maxY: block.label.y + 40,
      width: 80,
      height: 80,
    };
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function parsePoints(block: BlockShape): Array<[number, number]> {
  if (block.points) {
    return block.points
      .trim()
      .split(/\s+/)
      .map((pair) => {
        const [xs, ys] = pair.split(',');
        return [Number(xs), Number(ys)] as [number, number];
      })
      .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  }
  return [];
}

/** Estime la largeur d’un texte (Helvetica approximatif). */
export function estimateTextWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    // Accents / majuscules un peu plus larges
    if (ch === ' ' || ch === '.' || ch === ',' || ch === '’' || ch === "'") {
      w += fontSize * 0.28;
    } else if (ch === ch.toUpperCase() && /[A-ZÀ-ÖØ-Þ]/.test(ch)) {
      w += fontSize * 0.62;
    } else {
      w += fontSize * 0.52;
    }
  }
  return w;
}

export function fitLabel(
  name: string,
  maxWidth: number,
  maxFont: number,
  minFont: number,
): { text: string; fontSize: number } {
  const trimmed = name.trim();
  if (!trimmed) return { text: '', fontSize: maxFont };

  for (let fs = maxFont; fs >= minFont; fs -= 0.5) {
    if (estimateTextWidth(trimmed, fs) <= maxWidth) {
      return { text: trimmed, fontSize: fs };
    }
  }

  let cut = trimmed;
  while (
    cut.length > 1 &&
    estimateTextWidth(`${cut}…`, minFont) > maxWidth
  ) {
    cut = cut.slice(0, -1);
  }
  return {
    text: cut.length < trimmed.length ? `${cut}…` : cut,
    fontSize: minFont,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fillFor(count: 0 | 1 | 2): string {
  const key = occupancyClass(count) as keyof typeof BLOCK_FILL;
  return BLOCK_FILL[key];
}

function labelColor(count: 0 | 1 | 2): string {
  return count === 2 ? '#ffffff' : '#1a1a1a';
}

function renderDoor(label: string, x: number, y: number): string {
  const number = label.replace(/^Porte\s*/i, '');
  return `
  <g transform="translate(${x}, ${y})">
    <rect x="-52" y="-13" width="104" height="30" rx="15" fill="rgba(26,39,64,0.18)"/>
    <rect x="-52" y="-15" width="104" height="30" rx="15" fill="#f6d35a" stroke="#c9a227" stroke-width="1.2"/>
    <path d="M0 14 L6 22 L-6 22 Z" fill="#f6d35a" stroke="#c9a227" stroke-width="1" stroke-linejoin="round"/>
    <text x="-16" y="-1" text-anchor="start" fill="#5a4a12" font-size="8" font-weight="600" font-family="Helvetica, Arial, sans-serif">PORTE</text>
    <text x="-16" y="12" text-anchor="start" fill="#2a2208" font-size="13" font-weight="700" font-family="Georgia, serif">${escapeXml(number)}</text>
  </g>`;
}

function renderBlockLabels(
  block: BlockShape,
  assignment: BlockAssignment | undefined,
  members: Member[],
): string {
  const count = occupancyCount(assignment);
  const color = labelColor(count);
  const bounds = blockBounds(block);
  const maxWidth = Math.max(36, bounds.width * 0.82);
  const name1 = getMemberName(members, assignment?.person1 ?? null);
  const name2 = getMemberName(members, assignment?.person2 ?? null);

  const numSize = Math.min(26, Math.max(14, bounds.height * 0.18));
  const nameMax = Math.min(13, Math.max(8, bounds.height * 0.1));
  const nameMin = 6.5;

  const line1 = fitLabel(name1, maxWidth, nameMax, nameMin);
  const line2 = fitLabel(name2, maxWidth, nameMax, nameMin);

  const cx = block.label.x;
  const cy = block.label.y;
  // Numéro en haut, noms dessous — décalages relatifs à la hauteur du bloc
  const numY = cy - Math.min(22, bounds.height * 0.22);
  const n1Y = cy + Math.min(4, bounds.height * 0.04);
  const n2Y = cy + Math.min(18, bounds.height * 0.2);

  const emptyHint =
    count === 0
      ? `<text x="${cx}" y="${n1Y}" text-anchor="middle" dominant-baseline="middle" fill="${color}" fill-opacity="0.55" font-size="${Math.max(8, nameMax - 1)}" font-family="Helvetica, Arial, sans-serif">Libre</text>`
      : '';

  return `
    <text x="${cx}" y="${numY}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="${numSize}" font-weight="700" font-family="Georgia, serif">${block.id}</text>
    ${
      name1
        ? `<text x="${cx}" y="${n1Y}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="${line1.fontSize}" font-weight="600" font-family="Helvetica, Arial, sans-serif">${escapeXml(line1.text)}</text>`
        : emptyHint
    }
    ${
      name2
        ? `<text x="${cx}" y="${n2Y}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="${line2.fontSize}" font-weight="600" font-family="Helvetica, Arial, sans-serif">${escapeXml(line2.text)}</text>`
        : count === 1
          ? `<text x="${cx}" y="${n2Y}" text-anchor="middle" dominant-baseline="middle" fill="${color}" fill-opacity="0.5" font-size="${Math.max(7, nameMin)}" font-family="Helvetica, Arial, sans-serif">—</text>`
          : ''
    }`;
}

/**
 * Construit un SVG autonome (styles inline) à partir des géométries existantes.
 * Aucune duplication de coordonnées : lit `FloorGeometry` tel quel.
 */
export function buildFloorPlanSvgMarkup(
  geometry: FloorGeometry,
  state: AppState,
  options: PlanSvgBuildOptions,
): string {
  const blocks = getActiveBlocks(state);
  const accentFrom = options.accentFrom ?? '#3a8ee6';
  const accentTo = options.accentTo ?? '#1f6fbf';
  const parts = geometry.viewBox.split(/\s+/).map(Number);
  const vbW = parts[2] || 1000;
  const vbH = parts[3] || 650;
  const header = 56;
  const width = vbW;
  const height = vbH + header;

  const blockNodes = geometry.blocks
    .map((block) => {
      const assignment = blocks[block.id];
      const count = occupancyCount(assignment);
      const shape = block.points
        ? `<polygon points="${block.points}" fill="${fillFor(count)}" stroke="rgba(70,50,110,0.4)" stroke-width="2"/>`
        : block.d
          ? `<path d="${block.d}" fill="${fillFor(count)}" stroke="rgba(70,50,110,0.4)" stroke-width="2"/>`
          : '';
      return `<g>${shape}${renderBlockLabels(block, assignment, state.members)}</g>`;
    })
    .join('\n');

  const doors = geometry.doors.map((d) => renderDoor(d.label, d.x, d.y)).join('\n');

  const extras: string[] = [];
  if (geometry.extras?.voidPath) {
    extras.push(
      `<path d="${geometry.extras.voidPath}" fill="#eef3f9"/>`,
    );
  }
  if (geometry.extras?.redZone) {
    const z = geometry.extras.redZone;
    extras.push(`
      <rect x="${z.x}" y="${z.y}" width="${z.width}" height="${z.height}" fill="#d32f2f" rx="3"/>
      <text x="${z.x + z.width / 2}" y="${z.y + z.height * 0.68}" text-anchor="middle" fill="#fff" font-size="12" font-weight="700" font-family="Helvetica, Arial, sans-serif">Coordination</text>
    `);
  }
  if (geometry.extras?.chaire) {
    const c = geometry.extras.chaire;
    extras.push(`
      <rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" fill="#4a5568" rx="3"/>
      <text x="${c.x + c.width / 2}" y="${c.y + c.height * 0.68}" text-anchor="middle" fill="#f7fafc" font-size="18" font-family="Georgia, serif">Chaire</text>
    `);
  }

  const subtitle = options.subtitle
    ? `<text x="16" y="40" fill="#4a5568" font-size="13" font-family="Helvetica, Arial, sans-serif">${escapeXml(options.subtitle)}</text>`
    : '';

  // En-tête hors géométrie ; le plan conserve ses coordonnées d’origine (translate).
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(options.title)}">
  <defs>
    <linearGradient id="${escapeXml(options.gradientId)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${accentFrom}"/>
      <stop offset="100%" stop-color="${accentTo}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="#ffffff"/>
  <text x="16" y="22" fill="#1a2740" font-size="20" font-weight="700" font-family="Georgia, serif">${escapeXml(options.title)}</text>
  ${subtitle}
  <g transform="translate(0, ${header})">
    <path d="${geometry.floorPath}" fill="url(#${escapeXml(options.gradientId)})"/>
    ${extras.join('\n')}
    ${blockNodes}
    ${doors}
  </g>
</svg>`;
}

/** Extrait les noms affichés dans le SVG (pour tests). */
export function extractLabeledNamesFromSvg(svg: string): string[] {
  const names: string[] = [];
  const re =
    /font-family="Helvetica, Arial, sans-serif">([^<]+)<\/text>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const t = m[1]!.trim();
    if (
      t &&
      t !== 'Libre' &&
      t !== '—' &&
      t !== 'Coordination' &&
      t !== 'PORTE' &&
      !/^\d+$/.test(t)
    ) {
      names.push(t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
    }
  }
  return names;
}
