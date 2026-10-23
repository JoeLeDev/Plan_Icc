import * as XLSX from 'xlsx';
import { expect, type Page } from '@playwright/test';

export const STORAGE_KEY_V2 = 'cite-royale-placement-v2';

/** Accepte automatiquement les dialogues confirm/alert. */
export function autoAcceptDialogs(page: Page): void {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
}

/** Efface le stockage une fois (sans addInitScript, pour ne pas casser les tests de persistance). */
export async function gotoFresh(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    localStorage.removeItem('cite-royale-placement-v1');
  }, STORAGE_KEY_V2);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Placement Sainte Cène' }),
  ).toBeVisible();
}

export function exportButton(
  page: Page,
  label: 'Excel' | 'JSON' | 'Récap' | 'Plans' | 'Dossier',
) {
  return page
    .locator('.sidebar-section', { hasText: 'Export (planning actif)' })
    .getByRole('button', { name: label, exact: true });
}

export async function addMember(page: Page, name: string): Promise<void> {
  const form = page.locator('.sidebar-section', { hasText: 'Annuaire' });
  await form.getByPlaceholder('Nom du membre').fill(name);
  await form.getByRole('button', { name: 'Ajouter' }).click();
  await expect(
    page.locator('.sidebar .member-chip', { hasText: name }),
  ).toBeVisible();
}

export async function selectBlock(page: Page, blockId: number): Promise<void> {
  await page.getByRole('button', { name: new RegExp(`^Bloc ${blockId},`) }).click();
  await expect(
    page.getByRole('complementary', { name: `Affectation bloc ${blockId}` }),
  ).toBeVisible();
}

export async function assignMemberInPanel(
  page: Page,
  memberName: string,
): Promise<void> {
  const panel = page.locator('.assignment-panel');
  await panel.locator('.member-chip', { hasText: memberName }).click();
}

export async function createPlan(
  page: Page,
  title: string,
  date: string,
): Promise<void> {
  const section = page.locator('.plan-create');
  await section.getByPlaceholder('Ex. Sainte Cène').fill(title);
  await section.locator('input[type="date"]').fill(date);
  await section.getByRole('button', { name: 'Créer' }).click();
  await expect(page.locator('.active-plan-banner')).toContainText(title);
}

export function toast(page: Page) {
  return page.locator('.app-toast');
}

export function panelAlert(page: Page) {
  return page.locator('.assignment-panel [role="alert"]');
}

/** Génère un fichier Excel d’import en mémoire. */
export function buildImportXlsx(): Buffer {
  const wb = XLSX.utils.book_new();
  const rows = [
    ['Nom', 'Bloc', 'Place'],
    ['Marie Dupont', 3, 1],
    ['Jean Martín', 3, 2],
    ['Paul Bernard', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Membres');
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(out);
}

export async function readDownloadedXlsx(
  downloadPath: string,
): Promise<{ info: Record<string, unknown>[]; placements: Record<string, unknown>[] }> {
  const fs = await import('node:fs');
  const buf = fs.readFileSync(downloadPath);
  const wb = XLSX.read(buf, { type: 'buffer' });
  return {
    info: XLSX.utils.sheet_to_json(wb.Sheets.Info!),
    placements: XLSX.utils.sheet_to_json(wb.Sheets.Placements!),
  };
}
