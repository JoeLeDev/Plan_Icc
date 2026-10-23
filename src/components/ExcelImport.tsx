import { useMemo, useState } from 'react';
import {
  applyExcelImport,
  buildImportPreview,
  describeReplaceImpact,
  listWorkbookSheets,
  type ImportMode,
  type ImportPreview,
} from '../lib/excel';
import type { AppState } from '../types';

type Props = {
  state: AppState;
  onApplied: (next: AppState, message: string) => void;
};

export function ExcelImport({ state, onApplied }: Props) {
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [nameColumn, setNameColumn] = useState<string | null>(null);
  const [prenomColumn, setPrenomColumn] = useState<string | null>(null);
  const [blocColumn, setBlocColumn] = useState<string | null>(null);
  const [placeColumn, setPlaceColumn] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [loadError, setLoadError] = useState<string | null>(null);

  const open = buffer !== null;

  const preview: ImportPreview | null = useMemo(() => {
    if (!buffer) return null;
    return buildImportPreview({
      data: buffer,
      sheetName,
      nameColumn,
      prenomColumn,
      blocColumn,
      placeColumn,
      existingMembers: mode === 'replace' ? [] : state.members,
    });
  }, [
    buffer,
    sheetName,
    nameColumn,
    prenomColumn,
    blocColumn,
    placeColumn,
    mode,
    state.members,
  ]);

  const reset = () => {
    setBuffer(null);
    setFileName('');
    setSheetName('');
    setNameColumn(null);
    setPrenomColumn(null);
    setBlocColumn(null);
    setPlaceColumn(null);
    setMode('append');
    setLoadError(null);
  };

  const applyDetectedColumns = (next: ImportPreview) => {
    setNameColumn(next.detected.nameColumn);
    setPrenomColumn(next.detected.prenomColumn);
    setBlocColumn(next.detected.blocColumn);
    setPlaceColumn(next.detected.placeColumn);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const lower = file.name.toLocaleLowerCase('fr');
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      setLoadError('Format non supporté. Utilisez un fichier .xlsx ou .xls.');
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const sheets = listWorkbookSheets(data);
      if (sheets.length === 0) {
        setLoadError('Aucune feuille trouvée dans ce fichier.');
        return;
      }
      const firstPreview = buildImportPreview({
        data,
        sheetName: sheets[0],
        existingMembers: state.members,
      });
      setBuffer(data);
      setFileName(file.name);
      setSheetName(sheets[0]!);
      applyDetectedColumns(firstPreview);
      setMode('append');
      setLoadError(null);
    } catch {
      setLoadError('Impossible de lire ce fichier Excel.');
    }
  };

  const handleConfirm = () => {
    if (!preview) return;

    if (mode === 'replace') {
      const impact = describeReplaceImpact(state);
      if (
        !confirm(
          `Remplacer la liste existante ?\n\n${impact}\n\nLes affectations actuelles seront effacées.`,
        )
      ) {
        return;
      }
    }

    const result = applyExcelImport(state, preview, mode);
    if (!result.ok) {
      setLoadError(result.error ?? 'Import impossible.');
      return;
    }

    const { summary } = result;
    onApplied(
      result.state,
      `Import terminé : ${summary.membersAdded} membre(s) ajouté(s), ${summary.placementsApplied} préaffectation(s).`,
    );
    reset();
  };

  const canConfirm = Boolean(
    preview &&
      preview.stats.memberCount > 0 &&
      !(preview.errors.length > 0 && preview.stats.memberCount === 0),
  );

  const issueRows =
    preview?.candidates.filter(
      (c) =>
        c.status !== 'ready' &&
        c.status !== 'empty' &&
        c.status !== 'header_skipped',
    ) ?? [];

  return (
    <div className="excel-import-wrap">
      <label className="excel-import">
        <span className="btn">Choisir un fichier</span>
        <input
          type="file"
          accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={async (e) => {
            await handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </label>

      {loadError && !open ? (
        <p className="hint import-error" role="alert">
          {loadError}
        </p>
      ) : null}

      {open && preview ? (
        <div className="import-modal-backdrop" role="presentation">
          <div
            className="import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-modal-title"
          >
            <header className="import-modal-header">
              <div>
                <p className="eyebrow">Import Excel</p>
                <h2 id="import-modal-title">{fileName}</h2>
              </div>
              <button
                type="button"
                className="btn-icon close"
                onClick={reset}
                aria-label="Fermer"
              >
                ×
              </button>
            </header>

            <div className="import-modal-body">
              {preview.errors.length > 0 ? (
                <div className="panel-error" role="alert">
                  <span>{preview.errors.join(' ')}</span>
                </div>
              ) : null}
              {loadError ? (
                <div className="panel-error" role="alert">
                  <span>{loadError}</span>
                </div>
              ) : null}

              <section className="import-section">
                <h3>Feuille</h3>
                <select
                  value={sheetName}
                  onChange={(e) => {
                    const nextSheet = e.target.value;
                    setSheetName(nextSheet);
                    if (!buffer) return;
                    const next = buildImportPreview({
                      data: buffer,
                      sheetName: nextSheet,
                      existingMembers:
                        mode === 'replace' ? [] : state.members,
                    });
                    applyDetectedColumns(next);
                  }}
                  aria-label="Feuille à importer"
                >
                  {preview.sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </section>

              <section className="import-section">
                <h3>Colonnes</h3>
                <div className="import-grid">
                  <label>
                    Nom / Nom complet
                    <select
                      value={nameColumn ?? ''}
                      onChange={(e) => setNameColumn(e.target.value || null)}
                    >
                      <option value="">— Non définie —</option>
                      {preview.columns.map((c) => (
                        <option key={`name-${c}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Prénom (optionnel)
                    <select
                      value={prenomColumn ?? ''}
                      onChange={(e) => setPrenomColumn(e.target.value || null)}
                    >
                      <option value="">— Aucun —</option>
                      {preview.columns.map((c) => (
                        <option key={`prenom-${c}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Bloc (optionnel)
                    <select
                      value={blocColumn ?? ''}
                      onChange={(e) => setBlocColumn(e.target.value || null)}
                    >
                      <option value="">— Aucun —</option>
                      {preview.columns.map((c) => (
                        <option key={`bloc-${c}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Place (optionnel)
                    <select
                      value={placeColumn ?? ''}
                      onChange={(e) => setPlaceColumn(e.target.value || null)}
                    >
                      <option value="">— Aucun —</option>
                      {preview.columns.map((c) => (
                        <option key={`place-${c}`} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <section className="import-section">
                <h3>Mode d’import</h3>
                <div className="import-modes">
                  <label
                    className={`import-mode ${mode === 'append' ? 'active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'append'}
                      onChange={() => setMode('append')}
                    />
                    <span>
                      <strong>Ajouter</strong>
                      <small>
                        Conserve les membres et placements existants.
                      </small>
                    </span>
                  </label>
                  <label
                    className={`import-mode ${mode === 'replace' ? 'active' : ''}`}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      checked={mode === 'replace'}
                      onChange={() => setMode('replace')}
                    />
                    <span>
                      <strong>Remplacer</strong>
                      <small>{describeReplaceImpact(state)}</small>
                    </span>
                  </label>
                </div>
              </section>

              <section className="import-section">
                <h3>Prévisualisation</h3>
                <div className="import-stats">
                  <div>
                    <strong>{preview.stats.memberCount}</strong>
                    <span>à importer</span>
                  </div>
                  <div>
                    <strong>{preview.stats.duplicateInFile}</strong>
                    <span>doublons fichier</span>
                  </div>
                  <div>
                    <strong>
                      {mode === 'append' ? preview.stats.existsInApp : 0}
                    </strong>
                    <span>déjà présents</span>
                  </div>
                  <div>
                    <strong>{preview.stats.ignored}</strong>
                    <span>ignorées</span>
                  </div>
                  <div>
                    <strong>{preview.stats.withPlacement}</strong>
                    <span>préaffectations</span>
                  </div>
                  <div>
                    <strong>{preview.stats.placementConflicts}</strong>
                    <span>conflits</span>
                  </div>
                </div>

                {preview.stats.invalidPlacements > 0 ? (
                  <p className="hint import-warn">
                    {preview.stats.invalidPlacements} ligne(s) avec bloc/place
                    invalide ou en conflit — ces places ne seront pas attribuées.
                  </p>
                ) : null}

                <div className="import-table-wrap">
                  <table className="import-table">
                    <thead>
                      <tr>
                        <th>Ligne</th>
                        <th>Nom</th>
                        <th>Bloc</th>
                        <th>Place</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.candidates
                        .filter((c) => c.status !== 'empty')
                        .slice(0, 40)
                        .map((c) => (
                          <tr
                            key={`${c.rowIndex}-${c.importName || c.name}`}
                            className={
                              c.willImportMember
                                ? c.willAssign
                                  ? 'row-ok'
                                  : 'row-member'
                                : 'row-skip'
                            }
                          >
                            <td>{c.rowIndex}</td>
                            <td>
                              {c.willImportMember && c.importName !== c.name
                                ? c.importName
                                : c.name || '—'}
                            </td>
                            <td>{c.blockId ?? '—'}</td>
                            <td>
                              {c.slot === 'person1'
                                ? '1'
                                : c.slot === 'person2'
                                  ? '2'
                                  : '—'}
                            </td>
                            <td>{statusLabel(c)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {preview.candidates.filter((c) => c.status !== 'empty')
                    .length > 40 ? (
                    <p className="hint">
                      Aperçu limité aux 40 premières lignes non vides.
                    </p>
                  ) : null}
                </div>

                {issueRows.length > 0 ? (
                  <details className="import-issues">
                    <summary>{issueRows.length} ligne(s) à vérifier</summary>
                    <ul>
                      {issueRows.slice(0, 20).map((c) => (
                        <li key={`issue-${c.rowIndex}`}>
                          Ligne {c.rowIndex}
                          {c.name ? ` (${c.name})` : ''} :{' '}
                          {c.message ?? c.status}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            </div>

            <footer className="import-modal-footer">
              <button type="button" className="btn" onClick={reset}>
                Annuler
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                Confirmer l’import
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusLabel(c: {
  status: string;
  message?: string;
  willImportMember: boolean;
  willAssign: boolean;
}): string {
  if (c.message) return c.message;
  if (c.willAssign) return 'Membre + place';
  if (c.willImportMember) return 'Membre';
  return c.status;
}
