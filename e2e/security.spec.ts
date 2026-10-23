import { expect, test } from '@playwright/test';
import {
  STORAGE_KEY_V2,
  addMember,
  assignMemberInPanel,
  autoAcceptDialogs,
  createPlan,
  gotoFresh,
  selectBlock,
  toast,
} from './helpers';

test.describe('Sécurité des données', () => {
  test('localStorage invalide → démarrage propre', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, '{broken');
    }, STORAGE_KEY_V2);
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Placement Sainte Cène' }),
    ).toBeVisible();
    await expect(page.locator('.member-list .empty-list')).toBeVisible();
  });

  test('anciennes données v1 migrées au chargement', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('cite-royale-placement-v2');
      localStorage.setItem(
        'cite-royale-placement-v1',
        JSON.stringify({
          members: [{ id: 'legacy1', name: 'Legacy Alice' }],
          blocks: Object.fromEntries(
            Array.from({ length: 23 }, (_, i) => [
              i + 1,
              {
                person1: i + 1 === 1 ? 'legacy1' : null,
                person2: null,
              },
            ]),
          ),
        }),
      );
    });
    await page.goto('/');
    await expect(
      page.locator('.member-chip', { hasText: 'Legacy Alice' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Bloc 1, 1 sur 2/ }),
    ).toBeVisible();
  });

  test('restauration JSON malformée affiche une erreur', async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);

    const restoreInput = page
      .locator('.sidebar-section', { hasText: 'Sauvegarde globale' })
      .locator('input[type="file"]');
    await restoreInput.setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-valid'),
    });
    await expect(toast(page)).toContainText(/JSON/i);
  });

  test('suppression d’un membre affecté libère la place', async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
    await addMember(page, 'Karim');
    await selectBlock(page, 11);
    await assignMemberInPanel(page, 'Karim');

    await page
      .locator('li', { has: page.locator('.member-chip', { hasText: 'Karim' }) })
      .getByTitle('Supprimer')
      .click();

    await expect(page.locator('.member-chip', { hasText: 'Karim' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('button', { name: /Bloc 11, 0 sur 2/ }),
    ).toBeVisible();
  });

  test('suppression d’un planning conserve l’annuaire', async ({ page }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
    await createPlan(page, 'TempPlan', '2026-10-01');
    await addMember(page, 'Léa');
    await selectBlock(page, 1);
    await assignMemberInPanel(page, 'Léa');

    await createPlan(page, 'Conservé', '2026-10-02');
    await page
      .locator('.plan-list-item')
      .filter({ has: page.locator('.plan-list-title', { hasText: /^TempPlan$/ }) })
      .click();
    await page
      .locator('.plan-active-card')
      .getByRole('button', { name: 'Supprimer', exact: true })
      .click();
    await expect(toast(page)).toContainText(/supprimé/i);
    await expect(
      page.locator('.plan-list-title', { hasText: /^TempPlan$/ }),
    ).toHaveCount(0);
    await expect(
      page.locator('.sidebar .member-chip', { hasText: 'Léa' }),
    ).toBeVisible();
  });

  test('changements de statut (brouillon → finalisé → archivé)', async ({
    page,
  }) => {
    autoAcceptDialogs(page);
    await gotoFresh(page);
    await page.getByRole('button', { name: 'Finaliser' }).click();
    await expect(page.locator('.active-plan-banner')).toContainText('Finalisé');
    await page.getByRole('button', { name: 'Archiver' }).click();
    await expect(page.locator('.active-plan-banner')).toContainText('Archivé');
    await page.getByRole('button', { name: 'Rouvrir' }).click();
    await expect(page.locator('.active-plan-banner')).toContainText('Brouillon');
  });
});
