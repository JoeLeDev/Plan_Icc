import { BLOCK_IDS, getFloorForBlock, occupancyCount } from '../data/blocks';
import { getMemberName } from '../lib/placement';
import { getActiveBlocks } from '../lib/plans';
import type { AppState, FloorLevel } from '../types';

type Props = {
  state: AppState;
  level: FloorLevel | 'all';
  onSelectBlock: (blockId: number) => void;
};

export function RecapTable({ state, level, onSelectBlock }: Props) {
  const rows = BLOCK_IDS.filter((id) => {
    if (level === 'all') return true;
    return getFloorForBlock(id) === level;
  });

  return (
    <section className="recap-section">
      <h3>Récapitulatif des affectations</h3>
      <div className="recap-scroll">
        <table className="recap-table">
          <thead>
            <tr>
              <th>Bloc</th>
              <th>Niveau</th>
              <th>Occupation</th>
              <th>Personne 1</th>
              <th>Personne 2</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((blockId) => {
              const a = getActiveBlocks(state)[blockId];
              const count = occupancyCount(a);
              return (
                <tr
                  key={blockId}
                  onClick={() => onSelectBlock(blockId)}
                  className={`occ-${count}`}
                >
                  <td>
                    <strong>{blockId}</strong>
                  </td>
                  <td>
                    {getFloorForBlock(blockId) === 'rdc' ? 'RDC' : 'Mezz.'}
                  </td>
                  <td>
                    <span className={`pill status-${count === 0 ? 'empty' : count === 1 ? 'partial' : 'full'}`}>
                      {count}/2
                    </span>
                  </td>
                  <td>{getMemberName(state.members, a.person1) || '—'}</td>
                  <td>{getMemberName(state.members, a.person2) || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
