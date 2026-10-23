import { expect, test } from '@playwright/test';
import {
  addMember,
  assignMemberInPanel,
  autoAcceptDialogs,
  createPlan,
  exportButton,
  gotoFresh,
  readDownloadedXlsx,
  selectBlock,
  toast,
} from './helpers';

test.describe('Exports Excel / PDF', () => {
  test.beforeEach(async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
  });

  test('export Excel : 23 blocs, accents, date/titre, isolation planning', async ({
    page,
  }) => {
    await createPlan(page, 'Culte tableur', '2026-10-19');
    await addMember(page, 'José François');
    await addMember(page, 'Amélie');
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'José François');
    await page.getByRole('button', { name: /Mezzanine/ }).click();
    await selectBlock(page, 14);
    await assignMemberInPanel(page, 'Amélie');

    await createPlan(page, 'Autre planning', '2026-11-01');

    const downloadPromise = page.waitForEvent('download');
    await exportButton(page, 'Excel').click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();

    const { info, placements } = await readDownloadedXlsx(path!);
    expect(info[0]?.Titre).toBe('Autre planning');
    expect(info[0]?.Date).toBe('2026-11-01');
    expect(placements).toHaveLength(23);
    expect(
      placements.every((r) => r['Personne 1'] === '' && r['Personne 2'] === ''),
    ).toBe(true);

    await page.locator('.plan-list-item', { hasText: 'Culte tableur' }).click();
    const download2 = page.waitForEvent('download');
    await exportButton(page, 'Excel').click();
    const file2 = await download2;
    const path2 = await file2.path();
    const again = await readDownloadedXlsx(path2!);
    expect(again.info[0]?.Titre).toBe('Culte tableur');
    expect(again.info[0]?.Date).toBe('2026-10-19');
    expect(again.placements).toHaveLength(23);
    const b1 = again.placements.find((r) => r.Bloc === 1)!;
    const b14 = again.placements.find((r) => r.Bloc === 14)!;
    expect(b1['Personne 1']).toBe('José François');
    expect(b1.Niveau).toBe('RDC');
    expect(b14['Personne 1']).toBe('Amélie');
    expect(b14.Niveau).toBe('Mezzanine');
    expect(Object.keys(b1)).toEqual(
      expect.arrayContaining(['Bloc', 'Niveau', 'Personne 1', 'Personne 2']),
    );
  });

  test('export PDF récap télécharge un fichier A4 nommé avec la date', async ({
    page,
  }) => {
    await createPlan(page, 'Culte impression', '2026-10-21');
    await addMember(page, 'Hélène');
    await selectBlock(page, 2);
    await assignMemberInPanel(page, 'Hélène');

    const downloadPromise = page.waitForEvent('download');
    await exportButton(page, 'Récap').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      'placements-cite-royale-2026-10-21-recap.pdf',
    );
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('node:fs');
    const buf = fs.readFileSync(path!);
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    const latin1 = buf.toString('latin1');
    expect(latin1).toContain('Cité Royale');
    expect(latin1).toContain('RDC');
    expect(latin1).toContain('Mezzanine');
    expect(latin1).toContain('Hélène');
    expect(latin1).toContain('Culte impression');
  });

  test('export PDF plans : 2 pages paysage, noms et isolation', async ({
    page,
  }) => {
    await createPlan(page, 'Culte plans', '2026-10-22');
    await addMember(page, 'José François');
    await addMember(page, 'Amélie');
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'José François');
    await page.getByRole('button', { name: /Mezzanine/ }).click();
    await selectBlock(page, 14);
    await assignMemberInPanel(page, 'Amélie');

    const before = await page.evaluate(() =>
      localStorage.getItem('cite-royale-placement-v2'),
    );

    const downloadPromise = page.waitForEvent('download');
    await exportButton(page, 'Plans').click();
    const download = await downloadPromise;
    await expect(toast(page)).toContainText(/plans visuels/i);
    expect(download.suggestedFilename()).toBe(
      'placements-cite-royale-2026-10-22-plans.pdf',
    );

    const fs = await import('node:fs');
    const buf = fs.readFileSync((await download.path())!);
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    // 2 pages (RDC + mezzanine) — compteur PDF
    const pageMatches = buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageMatches.length).toBe(2);

    // Paysage A4 : MediaBox largeur > hauteur
    expect(buf.toString('latin1')).toMatch(/MediaBox\s*\[\s*0\s+0\s+841/);

    const after = await page.evaluate(() =>
      localStorage.getItem('cite-royale-placement-v2'),
    );
    expect(after).toBe(before);
  });

  test('export PDF dossier : plans + récap (plusieurs pages)', async ({
    page,
  }) => {
    await createPlan(page, 'Culte dossier', '2026-10-23');
    await addMember(page, 'Karim');
    await selectBlock(page, 3);
    await assignMemberInPanel(page, 'Karim');

    const downloadPromise = page.waitForEvent('download');
    await exportButton(page, 'Dossier').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(
      'placements-cite-royale-2026-10-23-dossier.pdf',
    );
    const fs = await import('node:fs');
    const buf = fs.readFileSync((await download.path())!);
    const latin1 = buf.toString('latin1');
    const pageMatches = latin1.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pageMatches.length).toBeGreaterThanOrEqual(3);
    expect(latin1).toContain('Karim');
  });
});
