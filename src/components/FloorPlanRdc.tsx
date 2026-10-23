import { RDC_GEOMETRY } from '../data/geometry';
import type { AppState } from '../types';
import { FloorPlanSvg } from './FloorPlanSvg';

type Props = {
  state: AppState;
  selectedBlockId: number | null;
  zoom: number;
  onSelectBlock: (blockId: number) => void;
};

export function FloorPlanRdc({
  state,
  selectedBlockId,
  zoom,
  onSelectBlock,
}: Props) {
  return (
    <FloorPlanSvg
      geometry={RDC_GEOMETRY}
      state={state}
      selectedBlockId={selectedBlockId}
      zoom={zoom}
      title="Auditorium Rez-de-chaussée"
      titleAccent="Rez-de-chaussée"
      accentClass="level-rdc"
      onSelectBlock={onSelectBlock}
    />
  );
}
