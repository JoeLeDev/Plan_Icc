import { occupancyClass, occupancyCount } from '../data/blocks';
import type { FloorGeometry } from '../data/geometry';
import { getActiveBlocks } from '../lib/plans';
import type { AppState } from '../types';

type Props = {
  geometry: FloorGeometry;
  state: AppState;
  selectedBlockId: number | null;
  zoom: number;
  title: string;
  titleAccent: string;
  accentClass: string;
  onSelectBlock: (blockId: number) => void;
};

export function FloorPlanSvg({
  geometry,
  state,
  selectedBlockId,
  zoom,
  title,
  titleAccent,
  accentClass,
  onSelectBlock,
}: Props) {
  return (
    <div className="floor-plan">
      <div className="floor-header">
        <p className="brand">Cité Royale · Sainte Cène</p>
        <h2>
          Auditorium – <span className={accentClass}>{titleAccent}</span>
        </h2>
        <p className="subtitle">Distribution / récupération / coordination</p>
      </div>

      <div className="plan-viewport">
        <div
          className="plan-zoom-layer"
          style={{ transform: `scale(${zoom})` }}
        >
          <svg
            className="plan-svg interactive"
            viewBox={geometry.viewBox}
            role="img"
            aria-label={title}
          >
            <defs>
              <linearGradient id={`floorGrad-${accentClass}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3a8ee6" />
                <stop offset="100%" stopColor="#1f6fbf" />
              </linearGradient>
            </defs>

            <path
              d={geometry.floorPath}
              className="floor-fill"
              style={{ fill: `url(#floorGrad-${accentClass})` }}
            />

            {geometry.extras?.voidPath ? (
              <path d={geometry.extras.voidPath} className="floor-void" />
            ) : null}

            {geometry.extras?.redZone ? (
              <g>
                <rect
                  x={geometry.extras.redZone.x}
                  y={geometry.extras.redZone.y}
                  width={geometry.extras.redZone.width}
                  height={geometry.extras.redZone.height}
                  className="red-zone"
                  rx={3}
                />
                <text
                  x={
                    geometry.extras.redZone.x +
                    geometry.extras.redZone.width / 2
                  }
                  y={
                    geometry.extras.redZone.y +
                    geometry.extras.redZone.height * 0.68
                  }
                  textAnchor="middle"
                  className="red-zone-label"
                >
                  Coordination
                </text>
              </g>
            ) : null}

            {geometry.blocks.map((block) => {
              const assignment = getActiveBlocks(state)[block.id];
              const count = occupancyCount(assignment);
              const status = occupancyClass(count);
              const selected = selectedBlockId === block.id;
              return (
                <g
                  key={block.id}
                  className={`svg-block status-${status} ${selected ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Bloc ${block.id}, ${count} sur 2`}
                  onClick={() => onSelectBlock(block.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectBlock(block.id);
                    }
                  }}
                >
                  {block.points ? (
                    <polygon points={block.points} className="block-shape" />
                  ) : block.d ? (
                    <path d={block.d} className="block-shape" />
                  ) : null}
                  <text
                    x={block.label.x}
                    y={block.label.y - 8}
                    className="block-label-num"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {block.id}
                  </text>
                  <text
                    x={block.label.x}
                    y={block.label.y + 16}
                    className="block-label-occ"
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    {count}/2
                  </text>
                </g>
              );
            })}

            {geometry.extras?.chaire ? (
              <g>
                <rect
                  x={geometry.extras.chaire.x}
                  y={geometry.extras.chaire.y}
                  width={geometry.extras.chaire.width}
                  height={geometry.extras.chaire.height}
                  className="chaire"
                  rx={3}
                />
                <text
                  x={
                    geometry.extras.chaire.x + geometry.extras.chaire.width / 2
                  }
                  y={
                    geometry.extras.chaire.y +
                    geometry.extras.chaire.height * 0.68
                  }
                  className="chaire-label"
                  textAnchor="middle"
                >
                  Chaire
                </text>
              </g>
            ) : null}

            {geometry.doors.map((door) => (
              <DoorBadge key={door.label} label={door.label} x={door.x} y={door.y} />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function DoorBadge({ label, x, y }: { label: string; x: number; y: number }) {
  const number = label.replace(/^Porte\s*/i, '');
  return (
    <g className="door-badge" transform={`translate(${x}, ${y})`}>
      {/* Ombre douce */}
      <rect
        x={-52}
        y={-13}
        width={104}
        height={30}
        rx={15}
        className="door-shadow"
      />
      {/* Pastille */}
      <rect
        x={-52}
        y={-15}
        width={104}
        height={30}
        rx={15}
        className="door-bg"
      />
      {/* Accroche vers l’allée */}
      <path d="M0 14 L6 22 L-6 22 Z" className="door-pointer" />
      {/* Icône porte ouverte */}
      <g transform="translate(-38, -8)" className="door-icon">
        <rect
          x={0}
          y={0}
          width={14}
          height={18}
          rx={1.5}
          className="door-icon-frame"
        />
        <path
          d="M7 1.5 C12 3 14 7 14 10 C14 14 11 17 7 17.5 Z"
          className="door-icon-leaf"
        />
        <circle cx={11} cy={10} r={1.1} className="door-icon-knob" />
      </g>
      <text x={-16} y={-1} className="door-label-kicker" textAnchor="start">
        Porte
      </text>
      <text x={-16} y={12} className="door-label-num" textAnchor="start">
        {number}
      </text>
    </g>
  );
}
