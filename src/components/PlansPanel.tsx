import { useState } from 'react';
import type { AppState, PlacementPlan } from '../types';
import {
  addBlankPlan,
  deletePlan,
  duplicatePlan,
  formatPlanLabel,
  planPlacementCount,
  renamePlan,
  reopenPlan,
  selectPlan,
  setPlanDate,
  setPlanStatus,
  statusLabel,
  todayDateInput,
} from '../lib/plans';

type Props = {
  state: AppState;
  onChange: (next: AppState, message?: string) => void;
};

export function PlansPanel({ state, onChange }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayDateInput());
  const active = state.plans.find((p) => p.id === state.activePlanId) ?? null;

  const create = (blank: boolean) => {
    const next = blank
      ? addBlankPlan(state, {
          title: title.trim() || 'Nouveau planning',
          date: date || todayDateInput(),
        })
      : addBlankPlan(state, {
          title: title.trim() || `Culte du ${date || todayDateInput()}`,
          date: date || todayDateInput(),
        });
    setTitle('');
    onChange(next, 'Planning créé.');
  };

  const duplicateActive = () => {
    if (!active) return;
    const next = duplicatePlan(state, active.id, {
      title: `${active.title} (copie)`,
      date: date || active.date,
    });
    onChange(next, 'Planning dupliqué.');
  };

  return (
    <section className="sidebar-section plans-panel">
      <h3>Plannings</h3>

      <label className="field-label">
        Planning actif
        <select
          value={state.activePlanId ?? ''}
          onChange={(e) =>
            onChange(selectPlan(state, e.target.value), 'Planning sélectionné.')
          }
        >
          {state.plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {statusLabel(plan.status)} · {formatPlanLabel(plan)} (
              {planPlacementCount(plan)}/46)
            </option>
          ))}
        </select>
      </label>

      {active ? (
        <div className="plan-active-card">
          <p className="plan-status">
            Statut : <strong>{statusLabel(active.status)}</strong>
          </p>
          <label className="field-label">
            Titre
            <input
              value={active.title}
              onChange={(e) =>
                onChange(renamePlan(state, active.id, e.target.value))
              }
            />
          </label>
          <label className="field-label">
            Date
            <input
              type="date"
              value={active.date}
              onChange={(e) =>
                onChange(setPlanDate(state, active.id, e.target.value))
              }
            />
          </label>
          <div className="btn-row wrap">
            {active.status === 'draft' ? (
              <>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() =>
                    onChange(
                      setPlanStatus(state, active.id, 'finalized'),
                      'Planning finalisé.',
                    )
                  }
                >
                  Finaliser
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    onChange(
                      setPlanStatus(state, active.id, 'archived'),
                      'Planning archivé.',
                    )
                  }
                >
                  Archiver
                </button>
              </>
            ) : null}
            {active.status === 'finalized' ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (
                      !confirm(
                        'Rouvrir ce planning finalisé en brouillon ? Les affectations redeviendront modifiables.',
                      )
                    ) {
                      return;
                    }
                    onChange(reopenPlan(state, active.id), 'Planning rouvert.');
                  }}
                >
                  Rouvrir
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    onChange(
                      setPlanStatus(state, active.id, 'archived'),
                      'Planning archivé.',
                    )
                  }
                >
                  Archiver
                </button>
              </>
            ) : null}
            {active.status === 'archived' ? (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  if (
                    !confirm(
                      'Rouvrir ce planning archivé en brouillon ?',
                    )
                  ) {
                    return;
                  }
                  onChange(reopenPlan(state, active.id), 'Planning rouvert.');
                }}
              >
                Rouvrir
              </button>
            ) : null}
            <button type="button" className="btn" onClick={duplicateActive}>
              Dupliquer
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                if (
                  !confirm(
                    `Supprimer le planning « ${active.title} » ? Les affectations de ce planning seront perdues (l’annuaire est conservé).`,
                  )
                ) {
                  return;
                }
                onChange(deletePlan(state, active.id), 'Planning supprimé.');
              }}
            >
              Supprimer
            </button>
          </div>
          {active.status !== 'draft' ? (
            <p className="hint">
              Affectations verrouillées — consultation et export possibles.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="plan-create">
        <h4>Nouveau planning</h4>
        <label className="field-label">
          Titre
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex. Sainte Cène"
          />
        </label>
        <label className="field-label">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="btn-row wrap">
          <button type="button" className="btn primary" onClick={() => create(false)}>
            Créer
          </button>
          <button type="button" className="btn" onClick={() => create(true)}>
            Vierge
          </button>
        </div>
      </div>

      <ul className="plan-list">
        {sortPlans(state.plans).map((plan) => (
          <li key={plan.id}>
            <button
              type="button"
              className={`plan-list-item ${plan.id === state.activePlanId ? 'active' : ''}`}
              onClick={() => onChange(selectPlan(state, plan.id))}
            >
              <span className={`plan-badge status-${plan.status}`}>
                {statusLabel(plan.status)}
              </span>
              <span className="plan-list-title">{plan.title}</span>
              <span className="chip-meta">
                {plan.date} · {planPlacementCount(plan)}/46
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function sortPlans(plans: PlacementPlan[]): PlacementPlan[] {
  return [...plans].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
