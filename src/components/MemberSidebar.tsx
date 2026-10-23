import { useMemo, useRef, useState } from 'react';
import {
  MEZZANINE_BLOCKS,
  RDC_BLOCKS,
  occupancyCount,
} from '../data/blocks';
import { findMemberLocation, isMemberPlaced } from '../lib/placement';
import {
  countMemberAssignments,
  getActiveBlocks,
  getActivePlan,
  isPlanEditable,
  statusLabel,
} from '../lib/plans';
import type { PdfExportMode } from '../lib/pdf';
import type { AppState } from '../types';
import { ExcelImport } from './ExcelImport';
import { PlansPanel } from './PlansPanel';

type Filter = 'all' | 'unplaced' | 'placed';

type Props = {
  state: AppState;
  selectedMemberId: string | null;
  selectedBlockId: number | null;
  onAddMember: (name: string) => void;
  onRemoveMember: (id: string) => void;
  onSelectMember: (id: string | null) => void;
  onImportApplied: (next: AppState, message: string) => void;
  onStateChange: (next: AppState, message?: string) => void;
  onExportExcel: () => void;
  onExportJson: () => void;
  onExportPdf: (mode: PdfExportMode) => void;
  onBackup: () => void;
  onRestoreBackup: (file: File) => void;
  onReset: () => void;
};

export function MemberSidebar({
  state,
  selectedMemberId,
  selectedBlockId,
  onAddMember,
  onRemoveMember,
  onSelectMember,
  onImportApplied,
  onStateChange,
  onExportExcel,
  onExportJson,
  onExportPdf,
  onBackup,
  onRestoreBackup,
  onReset,
}: Props) {
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const restoreRef = useRef<HTMLInputElement>(null);
  const blocks = getActiveBlocks(state);
  const activePlan = getActivePlan(state);
  const editable = isPlanEditable(activePlan);

  const placedCount = useMemo(() => {
    let n = 0;
    for (const a of Object.values(blocks)) {
      if (a.person1) n += 1;
      if (a.person2) n += 1;
    }
    return n;
  }, [blocks]);

  const rdcStats = useMemo(
    () => levelStats(blocks, RDC_BLOCKS),
    [blocks],
  );
  const mezzStats = useMemo(
    () => levelStats(blocks, MEZZANINE_BLOCKS),
    [blocks],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('fr');
    return state.members
      .filter((m) => {
        const placed = isMemberPlaced(blocks, m.id);
        if (filter === 'placed' && !placed) return false;
        if (filter === 'unplaced' && placed) return false;
        if (q && !m.name.toLocaleLowerCase('fr').includes(q)) return false;
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [state.members, blocks, search, filter]);

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <p className="eyebrow">Cité Royale</p>
        <h1>Placement Sainte Cène</h1>
        <p>2 personnes max par bloc · 23 blocs</p>
        {activePlan ? (
          <p className="active-plan-banner">
            {statusLabel(activePlan.status)} · {activePlan.title} (
            {activePlan.date})
          </p>
        ) : null}
      </header>

      <PlansPanel state={state} onChange={onStateChange} />

      <div className="stats">
        <div className="stat">
          <strong>{placedCount}</strong>
          <span>placés / 46</span>
        </div>
        <div className="stat">
          <strong>{state.members.length}</strong>
          <span>membres</span>
        </div>
        <div className="stat">
          <strong>{rdcStats.full + mezzStats.full}</strong>
          <span>blocs 2/2</span>
        </div>
      </div>

      <div className="level-stats">
        <div className="level-stat">
          <span>RDC</span>
          <strong>
            {rdcStats.placed}/{RDC_BLOCKS.length * 2}
          </strong>
        </div>
        <div className="level-stat">
          <span>Mezzanine</span>
          <strong>
            {mezzStats.placed}/{MEZZANINE_BLOCKS.length * 2}
          </strong>
        </div>
      </div>

      {!editable ? (
        <p className="hint import-warn">
          Planning verrouillé : les affectations ne sont pas modifiables.
        </p>
      ) : null}

      <section className="sidebar-section">
        <h3>Annuaire</h3>
        <form
          className="add-form"
          onSubmit={(e) => {
            e.preventDefault();
            onAddMember(name);
            setName('');
          }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du membre"
          />
          <button type="submit" className="btn primary">
            Ajouter
          </button>
        </form>
      </section>

      <section className="sidebar-section">
        <h3>Import Excel</h3>
        <ExcelImport state={state} onApplied={onImportApplied} />
        <p className="hint">
          Alimente l’annuaire. Les préaffectations s’appliquent au planning
          actif s’il est en brouillon.
        </p>
      </section>

      <section className="sidebar-section">
        <h3>Export (planning actif)</h3>
        <div className="btn-row wrap">
          <button type="button" className="btn" onClick={onExportExcel}>
            Excel
          </button>
          <button type="button" className="btn" onClick={onExportJson}>
            JSON
          </button>
        </div>
        <p className="hint" style={{ marginTop: '0.55rem' }}>
          PDF
        </p>
        <div className="btn-row wrap">
          <button
            type="button"
            className="btn"
            onClick={() => onExportPdf('summary')}
          >
            Récap
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onExportPdf('plans')}
          >
            Plans
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onExportPdf('dossier')}
          >
            Dossier
          </button>
        </div>
      </section>

      <section className="sidebar-section">
        <h3>Sauvegarde globale</h3>
        <div className="btn-row wrap">
          <button type="button" className="btn" onClick={onBackup}>
            Sauvegarder
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => restoreRef.current?.click()}
          >
            Restaurer…
          </button>
          <input
            ref={restoreRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRestoreBackup(file);
              e.target.value = '';
            }}
          />
        </div>
        <p className="hint">
          Archive complète (annuaire + tous les plannings). Confirmation
          requise avant restauration.
        </p>
      </section>

      <section className="sidebar-section grow">
        <h3>Membres</h3>
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
        />
        <div className="filter-row">
          {(
            [
              ['all', 'Tous'],
              ['unplaced', 'Non placés'],
              ['placed', 'Placés'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`filter-chip ${filter === key ? 'active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {selectedBlockId ? (
          <p className="hint">
            Membre sélectionné → cliquez un emplacement du bloc{' '}
            {selectedBlockId}, ou utilisez le panneau d’affectation.
          </p>
        ) : null}
        <ul className="member-list">
          {filtered.length === 0 && (
            <li className="empty-list">Aucun résultat</li>
          )}
          {filtered.map((m) => {
            const loc = findMemberLocation(blocks, m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className={`member-chip ${selectedMemberId === m.id ? 'active' : ''}`}
                  onClick={() =>
                    onSelectMember(selectedMemberId === m.id ? null : m.id)
                  }
                >
                  <span>{m.name}</span>
                  <span className="chip-meta">
                    {loc ? `Bloc ${loc.blockId}` : 'Libre'}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-icon"
                  title="Supprimer"
                  onClick={() => {
                    const n = countMemberAssignments(state, m.id);
                    if (
                      !confirm(
                        n > 0
                          ? `Supprimer « ${m.name} » ? Ce membre est affecté dans ${n} planning(s) ; ces places seront libérées.`
                          : `Supprimer « ${m.name} » de l’annuaire ?`,
                      )
                    ) {
                      return;
                    }
                    onRemoveMember(m.id);
                  }}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <button type="button" className="btn danger full" onClick={onReset}>
        Réinitialiser
      </button>
    </aside>
  );
}

function levelStats(
  blocks: ReturnType<typeof getActiveBlocks>,
  ids: readonly number[],
): { placed: number; full: number } {
  let placed = 0;
  let full = 0;
  for (const id of ids) {
    const a = blocks[id];
    const c = occupancyCount(a);
    placed += c;
    if (c === 2) full += 1;
  }
  return { placed, full };
}
