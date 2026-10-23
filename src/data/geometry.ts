/** Géométrie SVG relevée depuis les plans originaux (contours image, sans grille). */

export type Point = { x: number; y: number };

export type BlockShape = {
  id: number;
  d?: string;
  points?: string;
  label: Point;
};

export type DoorMarker = {
  label: string;
  x: number;
  y: number;
};

export type FloorGeometry = {
  viewBox: string;
  floorPath: string;
  blocks: BlockShape[];
  doors: DoorMarker[];
  extras?: {
    chaire?: { x: number; y: number; width: number; height: number };
    voidPath?: string;
    redZone?: { x: number; y: number; width: number; height: number };
  };
};

function poly(points: Array<[number, number]>): string {
  return (
    points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ') + 'z'
  );
}

/**
 * Polygones RDC extraits du plan original.
 * Basse : 5→4→3→2→1→13 — Haute : 6→7→8→9→10→11→12
 */
export const RDC_BLOCK_POLYGONS = [
  { id: 5, points: '45.0,425.4 149.2,425.4 149.2,566.3 45.0,566.3', cx: 97.1, cy: 495.8 },
  { id: 4, points: '201.9,356.6 320.7,356.6 326.3,363.0 326.3,566.3 201.9,566.3', cx: 264.0, cy: 461.6 },
  { id: 3, points: '354.3,337.5 483.2,338.6 483.2,548.3 354.3,548.3', cx: 418.7, cy: 442.9 },
  { id: 2, points: '516.8,337.5 645.7,342.8 644.6,548.3 516.8,548.3', cx: 581.2, cy: 443.0 },
  { id: 1, points: '678.2,356.6 802.6,356.6 802.6,566.3 678.2,566.3', cx: 740.4, cy: 461.4 },
  { id: 13, points: '845.2,425.4 955.0,425.4 955.0,566.3 845.2,566.3', cx: 900.1, cy: 495.8 },
  { id: 6, points: '105.5,187.1 176.1,242.2 121.2,347.1 27.1,331.2 46.1,277.2', cx: 102.8, cy: 275.3 },
  { id: 7, points: '130.2,167.0 228.8,82.3 255.7,210.4 192.9,261.3', cx: 200.6, cy: 176.3 },
  { id: 8, points: '266.9,78.0 400.3,78.0 404.7,213.6 289.3,210.4', cx: 339.9, cy: 144.0 },
  { id: 9, points: '422.7,78.0 561.6,78.0 561.6,213.6 422.7,213.6', cx: 492.2, cy: 145.8 },
  { id: 10, points: '585.2,78.0 723.0,78.0 684.9,213.6 585.2,213.6', cx: 646.4, cy: 142.0 },
  { id: 11, points: '769.0,86.5 869.8,168.1 820.5,245.4 729.7,192.4', cx: 796.6, cy: 170.8 },
  { id: 12, points: '831.7,251.7 899.0,175.5 967.3,312.1 864.2,329.1', cx: 895.5, cy: 264.6 },
] as const;

export const RDC_GEOMETRY: FloorGeometry = {
  viewBox: '0 0 1000 650',
  floorPath:
    'M24.2 275 L80 160 L200 55 L800 55 L920 160 L989.3 311.7 L974.5 576.4 L25.8 577.1 Z',
  doors: [
    { label: 'Porte 7', x: 160, y: 28 },
    { label: 'Porte 6', x: 310, y: 22 },
    { label: 'Porte 5', x: 500, y: 18 },
    { label: 'Porte 4', x: 690, y: 22 },
    { label: 'Porte 3', x: 840, y: 28 },
  ],
  extras: {
    chaire: { x: 210, y: 595, width: 580, height: 36 },
  },
  blocks: RDC_BLOCK_POLYGONS.map((block) => ({
    id: block.id,
    points: block.points,
    label: { x: block.cx, y: block.cy },
  })),
};

/**
 * Mezzanine — pleine largeur (comme le RDC), sans chevauchement.
 * Haute : 21→20→19→18→17→16 | Gauche : 22, 23 | Droite : 15, 14
 */
export const MEZZANINE_BLOCK_POLYGONS = [
  // Aile droite — bas → haut
  {
    id: 14,
    points: '810,460 945,460 945,595 810,595',
    cx: 878,
    cy: 528,
  },
  {
    id: 15,
    points: '795,285 945,285 945,435 815,435',
    cx: 875,
    cy: 360,
  },
  {
    id: 16,
    // angle haut-droit, s’arrête au-dessus de l’allée avant 15
    points: '785,70 900,70 955,145 955,255 800,255',
    cx: 875,
    cy: 165,
  },

  // Rangée haute — étalée sur toute la largeur
  {
    id: 17,
    points: '605,70 765,70 750,255 620,255',
    cx: 685,
    cy: 163,
  },
  {
    id: 18,
    points: '520,70 585,70 585,255 520,255',
    cx: 553,
    cy: 163,
  },
  {
    id: 19,
    points: '435,70 500,70 500,255 435,255',
    cx: 468,
    cy: 163,
  },
  {
    id: 20,
    points: '250,70 415,70 400,255 265,255',
    cx: 333,
    cy: 163,
  },
  {
    id: 21,
    // angle haut-gauche, s’arrête au-dessus de l’allée avant 22
    points: '45,145 100,70 230,70 215,255 45,255',
    cx: 130,
    cy: 165,
  },

  // Aile gauche
  {
    id: 22,
    points: '45,285 205,285 190,435 45,435',
    cx: 120,
    cy: 360,
  },
  {
    id: 23,
    points: '45,460 190,460 190,595 45,595',
    cx: 118,
    cy: 528,
  },
] as const;

export const MEZZANINE_GEOMETRY: FloorGeometry = {
  viewBox: '0 0 1000 650',
  // U pleine largeur, ouverture centrale vers le bas
  floorPath: poly([
    [25, 155],
    [85, 50],
    [915, 50],
    [975, 155],
    [975, 620],
    [780, 620],
    [780, 300],
    [280, 300],
    [280, 620],
    [25, 620],
  ]),
  doors: [
    { label: 'Porte 13', x: 240, y: 26 },
    { label: 'Porte 12', x: 775, y: 26 },
  ],
  extras: {
    redZone: {
      x: 435,
      y: 268,
      width: 150,
      height: 28,
    },
  },
  blocks: MEZZANINE_BLOCK_POLYGONS.map((block) => ({
    id: block.id,
    points: block.points,
    label: { x: block.cx, y: block.cy },
  })),
};
