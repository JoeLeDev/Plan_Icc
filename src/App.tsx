import { useEffect, useState } from 'react';
import { AssignmentPanel } from './components/AssignmentPanel';
import { FloorPlanMezzanine } from './components/FloorPlanMezzanine';
import { FloorPlanRdc } from './components/FloorPlanRdc';
import { MemberSidebar } from './components/MemberSidebar';
import { RecapTable } from './components/RecapTable';
import { getFloorForBlock } from './data/blocks';
import { exportToExcel, exportToJson } from './lib/excel';
import { exportToPdf, type PdfExportMode } from './lib/pdf';
import {
  assignByName,
  assignMemberToSlot,
  clearBlock,
  clearSlot,
  firstFreeSlot,
  type PlacementResult,
} from './lib/placement';
import {
  addMemberToDirectory,
  commitWorkspace,
  createInitialAppState,
  ensureEditable,
  getActivePlan,
  getWorkspace,
  isPlanEditable,
  removeMemberFromApp,
} from './lib/plans';
import {
  exportGlobalBackup,
  loadState,
  restoreGlobalBackup,
  saveState,
} from './lib/storage';
import type { AppState, FloorLevel, SlotKey } from './types';

function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [level, setLevel] = useState<FloorLevel>('rdc');
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [showRecap, setShowRecap] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const activePlan = getActivePlan(state);
  const locked = !isPlanEditable(activePlan);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const applyWorkspaceResult = (
    result: PlacementResult,
    successMessage?: string,
  ) => {
    if (result.ok) {
      setState((s) => commitWorkspace(s, result.state));
      setPanelError(null);
      if (successMessage) setToast(successMessage);
      return;
    }
    setPanelError(result.error ?? 'Opération impossible.');
  };

  const withEditableWorkspace = () => {
    const gate = ensureEditable(state);
    if (!gate.ok) {
      setPanelError(gate.error);
      return null;
    }
    return getWorkspace(state);
  };

  const handleSelectBlock = (blockId: number) => {
    const floor = getFloorForBlock(blockId);
    if (floor !== level) setLevel(floor);
    setSelectedBlockId(blockId);
    setPanelError(null);

    if (!selectedMemberId) return;

    const workspace = withEditableWorkspace();
    if (!workspace) {
      setSelectedMemberId(null);
      return;
    }

    const a = workspace.blocks[blockId];
    const free = a ? firstFreeSlot(a) : null;
    if (!free) {
      setPanelError(`Le bloc ${blockId} est déjà complet (2/2).`);
      setSelectedMemberId(null);
      return;
    }

    const result = assignMemberToSlot(
      workspace,
      selectedMemberId,
      blockId,
      free,
    );
    if (result.moveFrom && result.memberId) {
      const memberName =
        state.members.find((m) => m.id === result.memberId)?.name ??
        'Ce membre';
      const confirmed = confirm(
        `${memberName} est déjà placé au bloc ${result.moveFrom.blockId}.\n\nConfirmer le déplacement vers le bloc ${blockId} ?`,
      );
      if (!confirmed) {
        setPanelError('Déplacement annulé.');
        setSelectedMemberId(null);
        return;
      }
      const moved = assignMemberToSlot(
        workspace,
        result.memberId,
        blockId,
        free,
        { confirmMove: true },
      );
      applyWorkspaceResult(
        moved,
        moved.ok ? `${memberName} déplacé vers le bloc ${blockId}.` : undefined,
      );
      setSelectedMemberId(null);
      return;
    }

    applyWorkspaceResult(result, result.ok ? 'Membre affecté.' : undefined);
    setSelectedMemberId(null);
  };

  const handleAssign = (blockId: number, slot: SlotKey, memberId: string) => {
    const workspace = withEditableWorkspace();
    if (!workspace) return;

    const result = assignMemberToSlot(workspace, memberId, blockId, slot, {
      overwrite: true,
    });

    if (result.moveFrom && result.memberId) {
      const memberName =
        state.members.find((m) => m.id === result.memberId)?.name ??
        'Ce membre';
      const confirmed = confirm(
        `${memberName} est déjà placé au bloc ${result.moveFrom.blockId}.\n\nConfirmer le déplacement vers le bloc ${blockId} ?`,
      );
      if (!confirmed) {
        setPanelError('Déplacement annulé.');
        return;
      }
      const moved = assignMemberToSlot(workspace, memberId, blockId, slot, {
        overwrite: true,
        confirmMove: true,
      });
      applyWorkspaceResult(
        moved,
        `${memberName} déplacé vers le bloc ${blockId}.`,
      );
      return;
    }

    applyWorkspaceResult(result, 'Affectation enregistrée.');
  };

  const handleAssignByName = (
    blockId: number,
    slot: SlotKey,
    name: string,
  ) => {
    const workspace = withEditableWorkspace();
    if (!workspace) return;

    const result = assignByName(workspace, blockId, slot, name, {
      overwrite: true,
    });

    if (result.moveFrom && result.memberId) {
      const memberName =
        result.state.members.find((m) => m.id === result.memberId)?.name ??
        name.trim();
      const confirmed = confirm(
        `${memberName} est déjà placé au bloc ${result.moveFrom.blockId}.\n\nConfirmer le déplacement vers le bloc ${blockId} ?`,
      );
      if (!confirmed) {
        setPanelError('Déplacement annulé.');
        return;
      }
      const moved = assignByName(result.state, blockId, slot, name, {
        overwrite: true,
        confirmMove: true,
      });
      applyWorkspaceResult(moved, `${memberName} affecté au bloc ${blockId}.`);
      return;
    }

    applyWorkspaceResult(
      result,
      result.ok ? 'Affectation enregistrée.' : undefined,
    );
  };

  const handleAddMember = (name: string) => {
    const result = addMemberToDirectory(state, name);
    if (result.ok) {
      setState(result.state);
      setToast('Membre ajouté à l’annuaire.');
    } else {
      setToast(result.error);
    }
  };

  const handleRestore = async (file: File) => {
    const text = await file.text();
    const result = restoreGlobalBackup(text, state);
    if (!result.ok) {
      setToast(result.error);
      return;
    }
    if (
      !confirm(
        `Restaurer cette sauvegarde ?\n\nCela remplacera l’annuaire (${state.members.length} membre(s)) et ${state.plans.length} planning(s) actuels.`,
      )
    ) {
      return;
    }
    setState(result.state);
    setSelectedMemberId(null);
    setSelectedBlockId(null);
    setToast('Sauvegarde restaurée.');
  };

  return (
    <div className="app-shell">
      <MemberSidebar
        state={state}
        selectedMemberId={selectedMemberId}
        selectedBlockId={selectedBlockId}
        onAddMember={handleAddMember}
        onRemoveMember={(id) => setState((s) => removeMemberFromApp(s, id))}
        onSelectMember={setSelectedMemberId}
        onImportApplied={(next, message) => {
          setState(next);
          setPanelError(null);
          setToast(message);
        }}
        onStateChange={(next, message) => {
          setState(next);
          if (message) setToast(message);
        }}
        onExportExcel={() => exportToExcel(state)}
        onExportJson={() => exportToJson(state)}
        onExportPdf={(mode: PdfExportMode) => {
          void exportToPdf(state, mode)
            .then(() => {
              const label =
                mode === 'summary'
                  ? 'récapitulatif'
                  : mode === 'plans'
                    ? 'plans visuels'
                    : 'dossier complet';
              setToast(`PDF ${label} téléchargé.`);
            })
            .catch(() => {
              setToast('Échec de l’export PDF.');
            });
        }}
        onBackup={() => {
          exportGlobalBackup(state);
          setToast('Sauvegarde globale téléchargée.');
        }}
        onRestoreBackup={(file) => {
          void handleRestore(file);
        }}
        onReset={() => {
          if (
            !confirm(
              'Réinitialiser l’annuaire et tous les plannings ? Cette action est irréversible.',
            )
          ) {
            return;
          }
          setState(createInitialAppState());
          setSelectedMemberId(null);
          setSelectedBlockId(null);
          setPanelError(null);
          setToast('Données réinitialisées.');
        }}
      />

      <main className="main">
        {toast ? (
          <div className="app-toast" role="status">
            {toast}
          </div>
        ) : null}

        <div className="main-toolbar">
          <div className="tabs">
            <button
              type="button"
              className={level === 'rdc' ? 'tab active' : 'tab'}
              onClick={() => setLevel('rdc')}
            >
              Rez-de-chaussée (1–13)
            </button>
            <button
              type="button"
              className={level === 'mezzanine' ? 'tab active' : 'tab'}
              onClick={() => setLevel('mezzanine')}
            >
              Mezzanine (14–23)
            </button>
          </div>

          <div className="toolbar-actions">
            <div className="legend">
              <span>
                <i className="swatch empty" /> 0/2
              </span>
              <span>
                <i className="swatch partial" /> 1/2
              </span>
              <span>
                <i className="swatch full" /> 2/2
              </span>
            </div>
            <div className="zoom-controls">
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(1)))
                }
                aria-label="Zoom arrière"
              >
                −
              </button>
              <span>{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(1)))
                }
                aria-label="Zoom avant"
              >
                +
              </button>
              <button type="button" className="btn" onClick={() => setZoom(1)}>
                Reset
              </button>
            </div>
            <button
              type="button"
              className={`btn ${showRecap ? 'primary' : ''}`}
              onClick={() => setShowRecap((v) => !v)}
            >
              {showRecap ? 'Masquer récap' : 'Récapitulatif'}
            </button>
          </div>
        </div>

        <div className={`workspace ${selectedBlockId ? 'with-panel' : ''}`}>
          <div className="plan-column">
            {level === 'rdc' ? (
              <FloorPlanRdc
                state={state}
                selectedBlockId={selectedBlockId}
                zoom={zoom}
                onSelectBlock={handleSelectBlock}
              />
            ) : (
              <FloorPlanMezzanine
                state={state}
                selectedBlockId={selectedBlockId}
                zoom={zoom}
                onSelectBlock={handleSelectBlock}
              />
            )}

            {showRecap ? (
              <RecapTable
                state={state}
                level={level}
                onSelectBlock={handleSelectBlock}
              />
            ) : null}
          </div>

          {selectedBlockId != null ? (
            <AssignmentPanel
              blockId={selectedBlockId}
              state={state}
              error={panelError}
              locked={locked}
              onAssign={handleAssign}
              onAssignByName={handleAssignByName}
              onClearSlot={(blockId, slot) => {
                const workspace = withEditableWorkspace();
                if (!workspace) return;
                setState((s) =>
                  commitWorkspace(s, clearSlot(workspace, blockId, slot)),
                );
              }}
              onClearBlock={(blockId) => {
                const workspace = withEditableWorkspace();
                if (!workspace) return;
                setState((s) =>
                  commitWorkspace(s, clearBlock(workspace, blockId)),
                );
              }}
              onClose={() => {
                setSelectedBlockId(null);
                setPanelError(null);
              }}
              onDismissError={() => setPanelError(null)}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}

export default App;
