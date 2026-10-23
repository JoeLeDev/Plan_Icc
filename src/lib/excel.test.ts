import { describe, expect, it } from 'vitest';
import type { AppState, Member } from '../types';
import {
  applyExcelImport,
  buildImportPreview,
  describeReplaceImpact,
  listWorkbookSheets,
  workbookToArrayBuffer,
} from './excel';
import { createInitialAppState, getActiveBlocks, setActiveAssignment } from './plans';

function stateWith(members: Member[] = []): AppState {
  const base = createInitialAppState();
  return { ...base, members };
}

function member(id: string, name: string): Member {
  return { id, name };
}

describe('listWorkbookSheets', () => {
  it('liste les feuilles d’un fichier valide', () => {
    const data = workbookToArrayBuffer({
      Membres: [['Nom'], ['Alice']],
      Autre: [['X'], ['1']],
    });
    expect(listWorkbookSheets(data)).toEqual(['Membres', 'Autre']);
  });
});

describe('buildImportPreview', () => {
  it('importe un fichier valide avec noms', () => {
    const data = workbookToArrayBuffer({
      Liste: [
        ['Nom', 'Prénom', 'Email'],
        ['Dupont', 'Alice', 'a@test.fr'],
        ['Martin', 'Bob', 'b@test.fr'],
      ],
    });
    const preview = buildImportPreview({ data });
    expect(preview.stats.memberCount).toBe(2);
    expect(preview.candidates.filter((c) => c.willImportMember).map((c) => c.importName)).toEqual([
      'Alice Dupont',
      'Bob Martin',
    ]);
    expect(preview.errors).toEqual([]);
  });

  it('gère une feuille vide', () => {
    const data = workbookToArrayBuffer({
      Vide: [['Nom']],
    });
    const preview = buildImportPreview({ data, sheetName: 'Vide' });
    expect(preview.stats.memberCount).toBe(0);
    expect(preview.errors.some((e) => e.includes('aucune donnée'))).toBe(true);
  });

  it('tolère les colonnes supplémentaires', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom complet', 'Téléphone', 'Notes', 'Groupe'],
        ['Carla Nguyen', '0600000000', 'VIP', 'A'],
      ],
    });
    const preview = buildImportPreview({ data });
    expect(preview.stats.memberCount).toBe(1);
    expect(preview.candidates.find((c) => c.willImportMember)?.importName).toBe(
      'Carla Nguyen',
    );
  });

  it('détecte les doublons sans fusionner', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom'],
        ['Jean Dupont'],
        ['Jean Dupont'],
      ],
    });
    const preview = buildImportPreview({ data });
    expect(preview.stats.duplicateInFile).toBe(1);
    const imported = preview.candidates.filter((c) => c.willImportMember);
    expect(imported).toHaveLength(2);
    expect(imported[0]?.importName).toBe('Jean Dupont');
    expect(imported[1]?.importName).toBe('Jean Dupont (2)');
    expect(imported[1]?.status).toBe('duplicate_in_file');
  });

  it('ignore les noms manquants et les lignes vides', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Ville'],
        ['Alice', 'Paris'],
        ['', ''],
        ['', 'Lyon'],
      ],
    });
    const preview = buildImportPreview({ data });
    expect(preview.stats.memberCount).toBe(1);
    expect(preview.stats.ignored).toBeGreaterThanOrEqual(2);
    expect(
      preview.candidates.some((c) => c.status === 'missing_name'),
    ).toBe(true);
  });

  it('signale les blocs invalides', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Bloc', 'Place'],
        ['Alice', '99', '1'],
        ['Bob', '5', '1'],
      ],
    });
    const preview = buildImportPreview({ data });
    const alice = preview.candidates.find((c) => c.name === 'Alice');
    expect(alice?.status).toBe('invalid_block');
    expect(alice?.willAssign).toBe(false);
    expect(alice?.willImportMember).toBe(true);
    const bob = preview.candidates.find((c) => c.name === 'Bob');
    expect(bob?.willAssign).toBe(true);
  });

  it('ne préaffecte pas sans numéro de bloc', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Bloc', 'Place'],
        ['Alice', '', ''],
        ['Bob', '', '1'],
      ],
    });
    const preview = buildImportPreview({ data });
    const alice = preview.candidates.find((c) => c.name === 'Alice');
    expect(alice?.willAssign).toBe(false);
    expect(alice?.blockId).toBeNull();
    const bob = preview.candidates.find((c) => c.name === 'Bob');
    expect(bob?.willAssign).toBe(false);
    expect(bob?.status).toBe('invalid_block');
  });

  it('ne préaffecte pas un bloc sans place', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Bloc', 'Place'],
        ['Alice', '3', ''],
      ],
    });
    const preview = buildImportPreview({ data });
    const alice = preview.candidates.find((c) => c.name === 'Alice');
    expect(alice?.blockId).toBe(3);
    expect(alice?.willAssign).toBe(false);
    expect(alice?.status).toBe('invalid_place');
  });

  it('signale les conflits de placement', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Bloc', 'Place'],
        ['Alice', '1', '1'],
        ['Bob', '1', '1'],
      ],
    });
    const preview = buildImportPreview({ data });
    expect(preview.stats.placementConflicts).toBe(1);
    expect(preview.stats.withPlacement).toBe(1);
    const bob = preview.candidates.find((c) => c.name === 'Bob');
    expect(bob?.status).toBe('placement_conflict');
    expect(bob?.willAssign).toBe(false);
  });

  it('permet de forcer la colonne de nom manuellement', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Participant', 'Code'],
        ['Zoe Leroy', 'Z1'],
      ],
    });
    const auto = buildImportPreview({ data });
    // "Participant" is in FULL_NAME_ALIASES so may auto-detect
    const manual = buildImportPreview({
      data,
      nameColumn: 'Participant',
    });
    expect(manual.stats.memberCount).toBe(1);
    expect(manual.nameColumn).toBe('Participant');
    void auto;
  });

  it('marque les membres déjà présents sans fusion (append)', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [['Nom'], ['Alice'], ['Bob']],
    });
    const preview = buildImportPreview({
      data,
      existingMembers: [member('a1', 'Alice')],
    });
    expect(preview.stats.existsInApp).toBe(1);
    expect(preview.stats.memberCount).toBe(1);
    const alice = preview.candidates.find((c) => c.name === 'Alice');
    expect(alice?.willImportMember).toBe(false);
    expect(alice?.status).toBe('exists_in_app');
  });
});

describe('applyExcelImport', () => {
  it('ajoute sans préaffectation', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [['Nom'], ['Alice'], ['Bob']],
    });
    const preview = buildImportPreview({ data });
    const result = applyExcelImport(stateWith(), preview, 'append');
    expect(result.ok).toBe(true);
    expect(result.summary.membersAdded).toBe(2);
    expect(result.summary.placementsApplied).toBe(0);
    expect(result.state.members).toHaveLength(2);
  });

  it('applique les préaffectations valides', () => {
    const data = workbookToArrayBuffer({
      Feuil1: [
        ['Nom', 'Bloc', 'Place'],
        ['Alice', '14', '1'],
        ['Bob', '14', '2'],
      ],
    });
    const preview = buildImportPreview({ data });
    const result = applyExcelImport(stateWith(), preview, 'append');
    expect(result.summary.placementsApplied).toBe(2);
    expect(getActiveBlocks(result.state)[14]?.person1).toBeTruthy();
    expect(getActiveBlocks(result.state)[14]?.person2).toBeTruthy();
  });

  it('remplace la liste après mode replace', () => {
    let existing = stateWith([member('old', 'Ancien')]);
    existing = setActiveAssignment(existing, 1, 'person1', 'old');

    const data = workbookToArrayBuffer({
      Feuil1: [['Nom'], ['Nouveau']],
    });
    const preview = buildImportPreview({
      data,
      existingMembers: [],
    });
    const result = applyExcelImport(existing, preview, 'replace');
    expect(result.state.members.map((m) => m.name)).toEqual(['Nouveau']);
    expect(getActiveBlocks(result.state)[1]?.person1).toBeNull();
  });

  it('en append, conserve les placements existants', () => {
    let existing = stateWith([member('old', 'Ancien')]);
    existing = setActiveAssignment(existing, 2, 'person1', 'old');

    const data = workbookToArrayBuffer({
      Feuil1: [['Nom'], ['Alice']],
    });
    const preview = buildImportPreview({
      data,
      existingMembers: existing.members,
    });
    const result = applyExcelImport(existing, preview, 'append');
    expect(getActiveBlocks(result.state)[2]?.person1).toBe('old');
    expect(result.state.members).toHaveLength(2);
  });
});

describe('describeReplaceImpact', () => {
  it('décrit l’impact sur les placements', () => {
    let s = stateWith([member('a', 'Alice')]);
    s = setActiveAssignment(s, 1, 'person1', 'a');
    expect(describeReplaceImpact(s)).toContain('1 membre');
    expect(describeReplaceImpact(s)).toContain('1 affectation');
  });
});
