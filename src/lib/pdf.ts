import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BLOCK_IDS, getFloorForBlock } from '../data/blocks';
import { MEZZANINE_GEOMETRY, RDC_GEOMETRY } from '../data/geometry';
import type { AppState } from '../types';
import { countFullBlocks, countPlaced, getMemberName } from './placement';
import { buildFloorPlanSvgMarkup } from './planSvgExport';
import { formatPlanLabel, getActiveBlocks, getActivePlan } from './plans';

export type PdfExportMode = 'summary' | 'plans' | 'dossier';

const A4_LANDSCAPE = { orientation: 'landscape' as const, unit: 'mm' as const, format: 'a4' as const };
const A4_PORTRAIT = { orientation: 'portrait' as const, unit: 'mm' as const, format: 'a4' as const };

/** Rasterise un SVG en PNG (navigateur). */
export async function svgToPngDataUrl(
  svgMarkup: string,
  pixelWidth: number,
  pixelHeight: number,
): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Rasterisation SVG disponible uniquement dans le navigateur.');
  }

  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponible.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pixelWidth, pixelHeight);
    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Impossible de charger le SVG pour le PDF.'));
    img.src = src;
  });
}

function planSubtitle(state: AppState): string {
  const plan = getActivePlan(state);
  return plan ? formatPlanLabel(plan) : 'Plan de placement';
}

export function buildRdcPlanSvg(state: AppState): string {
  return buildFloorPlanSvgMarkup(RDC_GEOMETRY, state, {
    title: 'Cité Royale — Rez-de-chaussée (blocs 1–13)',
    subtitle: planSubtitle(state),
    gradientId: 'floorGradExportRdc',
    accentFrom: '#3a8ee6',
    accentTo: '#1f6fbf',
  });
}

export function buildMezzaninePlanSvg(state: AppState): string {
  return buildFloorPlanSvgMarkup(MEZZANINE_GEOMETRY, state, {
    title: 'Cité Royale — Mezzanine (blocs 14–23)',
    subtitle: planSubtitle(state),
    gradientId: 'floorGradExportMezz',
    accentFrom: '#5b9bd5',
    accentTo: '#2b6cb0',
  });
}

function addPlanImagePage(
  doc: jsPDF,
  pngDataUrl: string,
  opts: { firstPage: boolean },
): void {
  if (!opts.firstPage) {
    doc.addPage('a4', 'landscape');
  }
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 8;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  // SVG viewBox ~ 1000 × 706 → ratio
  const ratio = 1000 / 706;
  let drawW = maxW;
  let drawH = drawW / ratio;
  if (drawH > maxH) {
    drawH = maxH;
    drawW = drawH * ratio;
  }
  const x = (pageW - drawW) / 2;
  const y = (pageH - drawH) / 2;
  doc.addImage(pngDataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST');
}

async function appendVisualPlanPages(
  doc: jsPDF,
  state: AppState,
  options: { startFresh: boolean },
): Promise<void> {
  const rdcSvg = buildRdcPlanSvg(state);
  const mezzSvg = buildMezzaninePlanSvg(state);

  // Haute résolution pour l’impression A4 paysage (~200 dpi utiles)
  const pxW = 2400;
  const pxH = Math.round(pxW * (706 / 1000));

  const [rdcPng, mezzPng] = await Promise.all([
    svgToPngDataUrl(rdcSvg, pxW, pxH),
    svgToPngDataUrl(mezzSvg, pxW, pxH),
  ]);

  if (options.startFresh) {
    // Première page déjà créée en paysage
    addPlanImagePage(doc, rdcPng, { firstPage: true });
  } else {
    addPlanImagePage(doc, rdcPng, { firstPage: false });
  }
  addPlanImagePage(doc, mezzPng, { firstPage: false });
}

/** Construit le PDF récapitulatif nominatif (A4 portrait). */
export function buildSummaryPdfDocument(state: AppState, doc?: jsPDF): jsPDF {
  const target =
    doc ??
    new jsPDF(A4_PORTRAIT);

  // Si on enchaîne après des plans paysage, ajouter une page portrait.
  if (doc) {
    target.addPage('a4', 'portrait');
  }

  const plan = getActivePlan(state);
  const blocks = getActiveBlocks(state);
  const placed = countPlaced(blocks);
  const full = countFullBlocks(blocks);

  target.setFont('helvetica', 'bold');
  target.setFontSize(16);
  target.text('Cité Royale — Sainte Cène', 14, 18);
  target.setFont('helvetica', 'normal');
  target.setFontSize(11);
  target.text(plan ? formatPlanLabel(plan) : 'Plan de placement', 14, 26);
  target.setFontSize(10);
  target.text(
    `Membres: ${state.members.length}  |  Places: ${placed}/46  |  Blocs complets: ${full}/23`,
    14,
    34,
  );
  target.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, 14, 40);

  const rows = BLOCK_IDS.map((blockId) => {
    const a = blocks[blockId]!;
    return [
      String(blockId),
      getFloorForBlock(blockId) === 'rdc' ? 'RDC' : 'Mezzanine',
      getMemberName(state.members, a.person1) || '—',
      getMemberName(state.members, a.person2) || '—',
    ];
  });

  autoTable(target, {
    startY: 46,
    head: [['Bloc', 'Niveau', 'Personne 1', 'Personne 2']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [31, 111, 191] },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 28 },
      2: { cellWidth: 70 },
      3: { cellWidth: 70 },
    },
    margin: { left: 14, right: 14 },
  });

  const unplaced = state.members.filter((m) => {
    return !Object.values(blocks).some(
      (a) => a.person1 === m.id || a.person2 === m.id,
    );
  });

  if (unplaced.length) {
    const finalY =
      (target as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? 46;
    target.text('Membres non placés', 14, finalY + 10);
    autoTable(target, {
      startY: finalY + 14,
      head: [['Nom']],
      body: unplaced.map((m) => [m.name]),
      styles: { fontSize: 9, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [90, 106, 133] },
      margin: { left: 14, right: 14 },
    });
  }

  return target;
}

/** @deprecated Prefer buildSummaryPdfDocument / buildPdfDocument. */
export function buildPdfDocument(state: AppState): jsPDF {
  return buildSummaryPdfDocument(state);
}

export async function buildPdfDocumentAsync(
  state: AppState,
  mode: PdfExportMode = 'summary',
): Promise<jsPDF> {
  if (mode === 'summary') {
    return buildSummaryPdfDocument(state);
  }

  if (mode === 'plans') {
    const doc = new jsPDF(A4_LANDSCAPE);
    await appendVisualPlanPages(doc, state, { startFresh: true });
    return doc;
  }

  // dossier : plans paysage puis récap portrait
  const doc = new jsPDF(A4_LANDSCAPE);
  await appendVisualPlanPages(doc, state, { startFresh: true });
  buildSummaryPdfDocument(state, doc);
  return doc;
}

function fileSuffix(mode: PdfExportMode): string {
  if (mode === 'summary') return 'recap';
  if (mode === 'plans') return 'plans';
  return 'dossier';
}

export async function exportToPdf(
  state: AppState,
  mode: PdfExportMode = 'summary',
): Promise<void> {
  const plan = getActivePlan(state);
  const doc = await buildPdfDocumentAsync(state, mode);
  const date = plan?.date ?? 'planning';
  doc.save(`placements-cite-royale-${date}-${fileSuffix(mode)}.pdf`);
}

export function pdfPageCount(doc: jsPDF): number {
  return doc.getNumberOfPages();
}
