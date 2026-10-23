import { expect, test } from '@playwright/test';
import {
  addMember,
  assignMemberInPanel,
  autoAcceptDialogs,
  buildImportXlsx,
  createPlan,
  gotoFresh,
  panelAlert,
  selectBlock,
  toast,
} from './helpers';

test.describe('Parcours métier', () => {
  test.beforeEach(async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
  });

  test('import Excel avec prévisualisation', async ({ page }) => {
    const fileInput = page.locator('.excel-import input[type="file"]');
    await fileInput.setInputFiles({
      name: 'membres.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: buildImportXlsx(),
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Prévisualisation')).toBeVisible();
    await expect(dialog.getByText('Marie Dupont')).toBeVisible();
    await expect(dialog.getByText('Jean Martín')).toBeVisible();
    await expect(dialog.getByText('Paul Bernard')).toBeVisible();
    await expect(dialog.locator('.import-stats')).toContainText('3');

    await dialog.getByRole('button', { name: 'Confirmer l’import' }).click();
    await expect(toast(page)).toContainText(/Import terminé/);
    await expect(page.locator('.member-chip', { hasText: 'Marie Dupont' })).toBeVisible();
    await expect(page.locator('.member-chip', { hasText: 'Jean Martín' })).toBeVisible();
    // Préaffectations bloc 3
    await expect(
      page.getByRole('button', { name: /Bloc 3, 2 sur 2/ }),
    ).toBeVisible();
  });

  test('création de planning + affectations RDC / mezzanine', async ({
    page,
  }) => {
    await createPlan(page, 'Culte E2E', '2026-10-25');
    await addMember(page, 'Alice RDC');
    await addMember(page, 'Bob Mezz');

    await page.getByRole('button', { name: /Rez-de-chaussée/ }).click();
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'Alice RDC');
    await expect(page.locator('.slot-card.filled strong')).toContainText(
      'Alice RDC',
    );

    await page.getByRole('button', { name: /Mezzanine/ }).click();
    await selectBlock(page, 14);
    await assignMemberInPanel(page, 'Bob Mezz');
    await expect(page.locator('.slot-card.filled strong')).toContainText(
      'Bob Mezz',
    );

    await expect(page.locator('.stats')).toContainText('2');
    await expect(page.locator('.level-stats')).toContainText('1/26');
    await expect(page.locator('.level-stats')).toContainText('1/20');
  });

  test('déplacement d’un membre avec confirmation', async ({ page }) => {
    await addMember(page, 'Claire');
    await selectBlock(page, 2);
    await assignMemberInPanel(page, 'Claire');

    await selectBlock(page, 5);
    await assignMemberInPanel(page, 'Claire');
    await expect(toast(page)).toContainText(/déplacé/);
    await expect(
      page.getByRole('button', { name: /Bloc 2, 0 sur 2/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Bloc 5, 1 sur 2/ }),
    ).toBeVisible();
  });

  test('refus des doublons et dépassements de capacité', async ({ page }) => {
    await addMember(page, 'Denis');
    // Doublon annuaire
    await page
      .locator('.sidebar-section', { hasText: 'Annuaire' })
      .getByPlaceholder('Nom du membre')
      .fill('denis');
    await page
      .locator('.sidebar-section', { hasText: 'Annuaire' })
      .getByRole('button', { name: 'Ajouter' })
      .click();
    await expect(toast(page)).toContainText(/existe déjà/);

    await addMember(page, 'Emma');
    await addMember(page, 'Fred');
    await selectBlock(page, 4);
    await assignMemberInPanel(page, 'Emma');
    await assignMemberInPanel(page, 'Fred');
    await expect(
      page.getByRole('button', { name: /Bloc 4, 2 sur 2/ }),
    ).toBeVisible();

    // Fermer le panneau puis sélection membre + clic bloc plein
    await page
      .getByRole('complementary', { name: 'Affectation bloc 4' })
      .getByRole('button', { name: 'Terminé' })
      .click();
    await page.locator('.sidebar .member-chip', { hasText: 'Denis' }).click();
    await page.getByRole('button', { name: /Bloc 4, 2 sur 2/ }).click();
    await expect(panelAlert(page)).toContainText(/déjà complet/);
  });

  test('duplication et indépendance des affectations', async ({ page }) => {
    await createPlan(page, 'Original', '2026-10-10');
    await addMember(page, 'Gina');
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'Gina');

    await page.getByRole('button', { name: 'Dupliquer' }).click();
    await expect(toast(page)).toContainText(/dupliqué/i);
    await expect(page.locator('.active-plan-banner')).toContainText('copie');

    // Sur la copie : retirer Gina
    await selectBlock(page, 1);
    await page.locator('.slot-card.filled .slot-remove').click();
    await expect(
      page.getByRole('button', { name: /Bloc 1, 0 sur 2/ }),
    ).toBeVisible();

    // Revenir à l’original : Gina toujours placée
    await page
      .locator('.plan-list-item')
      .filter({ has: page.locator('.plan-list-title', { hasText: /^Original$/ }) })
      .click();
    await expect(page.locator('.active-plan-banner')).toContainText('Original');
    await expect(page.locator('.active-plan-banner')).not.toContainText('copie');
    await expect(
      page.getByRole('button', { name: /Bloc 1, 1 sur 2/ }),
    ).toBeVisible();
  });

  test('finalisation, verrouillage et réouverture', async ({ page }) => {
    await addMember(page, 'Hugo');
    await selectBlock(page, 8);
    await assignMemberInPanel(page, 'Hugo');

    await page.getByRole('button', { name: 'Finaliser' }).click();
    await expect(toast(page)).toContainText(/finalisé/i);
    await expect(page.locator('.sidebar .import-warn')).toContainText(
      /verrouillé/i,
    );

    // Tentative d’affectation bloquée
    await selectBlock(page, 9);
    await expect(
      page.locator('.assignment-panel [role="status"]'),
    ).toContainText(/consultation uniquement/i);

    await page.getByRole('button', { name: 'Rouvrir' }).click();
    await expect(toast(page)).toContainText(/rouvert/i);
    await expect(page.locator('.active-plan-banner')).toContainText('Brouillon');
  });

  test('persistance après rechargement', async ({ page }) => {
    await createPlan(page, 'Persistant', '2026-10-22');
    await addMember(page, 'Iris');
    await selectBlock(page, 6);
    await assignMemberInPanel(page, 'Iris');

    await page.reload();
    await expect(page.locator('.active-plan-banner')).toContainText('Persistant');
    await expect(page.locator('.member-chip', { hasText: 'Iris' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Bloc 6, 1 sur 2/ }),
    ).toBeVisible();
  });

  test('sauvegarde et restauration JSON', async ({ page }) => {
    await addMember(page, 'Jules');
    await selectBlock(page, 10);
    await assignMemberInPanel(page, 'Jules');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Sauvegarder' }).click();
    const download = await downloadPromise;
    const path = await download.path();
    expect(path).toBeTruthy();
    expect(download.suggestedFilename()).toMatch(/cite-royale-sauvegarde/);

    // Réinitialiser puis restaurer
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(toast(page)).toContainText(/réinitialisées/i);
    await expect(page.locator('.member-chip', { hasText: 'Jules' })).toHaveCount(
      0,
    );

    const restoreInput = page.locator(
      '.sidebar-section',
      { hasText: 'Sauvegarde globale' },
    ).locator('input[type="file"]');
    await restoreInput.setInputFiles(path!);
    await expect(toast(page)).toContainText(/restaurée/i);
    await expect(page.locator('.member-chip', { hasText: 'Jules' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Bloc 10, 1 sur 2/ }),
    ).toBeVisible();
  });
});
