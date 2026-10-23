import { expect, test } from '@playwright/test';
import {
  addMember,
  assignMemberInPanel,
  autoAcceptDialogs,
  createPlan,
  gotoFresh,
  selectBlock,
} from './helpers';

/**
 * Contrôle visuel : injecte les SVG d’export dans la page et capture des screenshots
 * inspectables (RDC + mezzanine avec noms / accents / bloc vide).
 */
test.describe('Contrôle visuel PDF (SVG export)', () => {
  test('screenshots RDC et mezzanine avec affectations', async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
    await createPlan(page, 'Visuel Sainte Cène', '2026-10-23');
    await addMember(page, 'José François');
    await addMember(page, 'Amélie Dupont');
    await addMember(page, 'Jean-Baptiste Extraordinaire');
    await addMember(page, 'Hélène');
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'José François');
    await assignMemberInPanel(page, 'Amélie Dupont');
    await selectBlock(page, 9);
    await assignMemberInPanel(page, 'Jean-Baptiste Extraordinaire');
    await page.getByRole('button', { name: /Mezzanine/ }).click();
    await selectBlock(page, 14);
    await assignMemberInPanel(page, 'Hélène');

    const { rdc, mezz } = await page.evaluate(async () => {
      const mod = await import('/src/lib/pdf.ts');
      // Lire l’état depuis localStorage (même source que l’app)
      const raw = localStorage.getItem('cite-royale-placement-v2');
      if (!raw) throw new Error('Pas d’état');
      const state = JSON.parse(raw);
      return {
        rdc: mod.buildRdcPlanSvg(state),
        mezz: mod.buildMezzaninePlanSvg(state),
      };
    });

    expect(rdc).toContain('José');
    expect(rdc).toContain('Amélie');
    expect(mezz).toContain('Mezzanine');

    await page.setContent(`
      <!DOCTYPE html>
      <html><head><meta charset="utf-8"/><style>
        body { margin: 0; background: #ddd; font-family: sans-serif; }
        .sheet { background: #fff; margin: 12px auto; width: 1000px; box-shadow: 0 2px 12px rgba(0,0,0,.2); }
      </style></head>
      <body>
        <div class="sheet" id="rdc">${rdc.replace(/^<\?xml[^>]*>/, '')}</div>
        <div class="sheet" id="mezz">${mezz.replace(/^<\?xml[^>]*>/, '')}</div>
      </body></html>
    `);

    await page.locator('#rdc svg').waitFor();
    await page.locator('#rdc').screenshot({
      path: 'test-results/visual-rdc-export.png',
    });
    await page.locator('#mezz').screenshot({
      path: 'test-results/visual-mezz-export.png',
    });

    // Fichiers produits pour inspection manuelle / agent
    const fs = await import('node:fs');
    expect(fs.existsSync('test-results/visual-rdc-export.png')).toBe(true);
    expect(fs.existsSync('test-results/visual-mezz-export.png')).toBe(true);
  });
});
