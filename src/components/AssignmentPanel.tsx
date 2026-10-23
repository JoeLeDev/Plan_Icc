import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { getFloorForBlock, occupancyCount } from '../data/blocks';
import {
  findMemberLocation,
  getMemberName,
} from '../lib/placement';
import { getActiveBlocks, isPlanEditable, getActivePlan } from '../lib/plans';
import type { AppState, SlotKey } from '../types';

type Props = {
  blockId: number;
  state: AppState;
  error: string | null;
  locked?: boolean;
  onAssign: (blockId: number, slot: SlotKey, memberId: string) => void;
  onAssignByName: (blockId: number, slot: SlotKey, name: string) => void;
  onClearSlot: (blockId: number, slot: SlotKey) => void;
  onClearBlock: (blockId: number) => void;
  onClose: () => void;
  onDismissError: () => void;
};

export function AssignmentPanel({
  blockId,
  state,
  error,
  locked = false,
  onAssign,
  onAssignByName,
  onClearSlot,
  onClearBlock,
  onClose,
  onDismissError,
}: Props) {
  const blocks = getActiveBlocks(state);
  const assignment = blocks[blockId];
  const editable = !locked && isPlanEditable(getActivePlan(state));
  const count = occupancyCount(assignment);
  const floor = getFloorForBlock(blockId);
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [activeSlot, setActiveSlot] = useState<SlotKey>(
    !assignment?.person1
      ? 'person1'
      : !assignment.person2
        ? 'person2'
        : 'person1',
  );

  useEffect(() => {
    setActiveSlot(
      !assignment?.person1
        ? 'person1'
        : !assignment.person2
          ? 'person2'
          : 'person1',
    );
    setQuery('');
    setNewName('');
    onDismissError();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset UI when switching block
  }, [blockId]);

  // Après une affectation, cibler le prochain emplacement libre (évite d’écraser la place 1).
  useEffect(() => {
    if (!assignment?.person1) setActiveSlot('person1');
    else if (!assignment.person2) setActiveSlot('person2');
  }, [assignment?.person1, assignment?.person2]);

  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    return state.members
      .filter((m) => !q || m.name.toLocaleLowerCase('fr').includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [state.members, query]);

  const handleAssignClick = (memberId: string) => {
    onAssign(blockId, activeSlot, memberId);
  };

  const handleAddAndAssign = (e: FormEvent) => {
    e.preventDefault();
    onAssignByName(blockId, activeSlot, newName);
    setNewName('');
  };

  return (
    <aside
      className="assignment-panel"
      aria-label={`Affectation bloc ${blockId}`}
    >
      <header className="assignment-header">
        <div>
          <p className="eyebrow">
            {floor === 'rdc' ? 'Rez-de-chaussée' : 'Mezzanine'}
          </p>
          <h2>Bloc {blockId}</h2>
          <p className="subtitle">{count}/2 places occupées</p>
        </div>
        <button
          type="button"
          className="btn-icon close"
          onClick={onClose}
          aria-label="Fermer"
        >
          ×
        </button>
      </header>

      {!editable ? (
        <div className="panel-error" role="status">
          <span>
            Planning verrouillé — consultation uniquement. Rouvrez-le pour
            modifier les affectations.
          </span>
        </div>
      ) : null}

      {error ? (
        <div className="panel-error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="btn-icon"
            onClick={onDismissError}
            aria-label="Fermer l’alerte"
          >
            ×
          </button>
        </div>
      ) : null}

      <div className="slot-cards">
        {(['person1', 'person2'] as const).map((slot, index) => {
          const memberId = assignment?.[slot] ?? null;
          const name = getMemberName(state.members, memberId);
          const active = activeSlot === slot;
          return (
            <button
              key={slot}
              type="button"
              className={`slot-card ${active ? 'active' : ''} ${memberId ? 'filled' : ''}`}
              onClick={() => setActiveSlot(slot)}
            >
              <span className="slot-label">Emplacement {index + 1}</span>
              <strong>{name || 'Libre'}</strong>
              {memberId && editable ? (
                <span
                  className="slot-remove"
                  role="button"
                  tabIndex={0}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onClearSlot(blockId, slot);
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') {
                      ev.stopPropagation();
                      onClearSlot(blockId, slot);
                    }
                  }}
                >
                  Retirer
                </span>
              ) : !memberId ? (
                <span className="slot-hint">Sélectionnez ou ajoutez un membre ↓</span>
              ) : null}
            </button>
          );
        })}
      </div>

      {editable ? (
        <>
          <section className="sidebar-section">
            <h3>Ajouter et affecter</h3>
            <form className="add-form" onSubmit={handleAddAndAssign}>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nouveau membre"
                aria-label="Nom du nouveau membre"
              />
              <button type="submit" className="btn primary">
                Affecter
              </button>
            </form>
          </section>

          <div className="assignment-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un membre…"
              aria-label="Rechercher un membre"
            />
          </div>

          <ul className="assignment-list">
            {candidates.length === 0 && (
              <li className="empty-list">
                {state.members.length === 0
                  ? 'Aucun membre — ajoutez-en un ci-dessus.'
                  : 'Aucun résultat pour cette recherche.'}
              </li>
            )}
            {candidates.map((m) => {
              const loc = findMemberLocation(blocks, m.id);
              const here = loc?.blockId === blockId;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`member-chip ${here ? 'active' : ''}`}
                    disabled={here}
                    onClick={() => handleAssignClick(m.id)}
                  >
                    <span>{m.name}</span>
                    {loc && !here ? (
                      <span className="chip-meta">bloc {loc.blockId}</span>
                    ) : here ? (
                      <span className="chip-meta">ici</span>
                    ) : (
                      <span className="chip-meta">libre</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="hint">
            Un membre ne peut occuper qu’un seul emplacement par planning. Un
            déplacement demandera confirmation.
          </p>
        </>
      ) : null}

      <div className="btn-row">
        {editable ? (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (
                confirm(
                  `Vider le bloc ${blockId} (retirer les deux emplacements) ?`,
                )
              ) {
                onClearBlock(blockId);
              }
            }}
          >
            Vider le bloc
          </button>
        ) : null}
        <button type="button" className="btn primary" onClick={onClose}>
          Terminé
        </button>
      </div>
    </aside>
  );
}
