import { MEZZANINE_GEOMETRY } from '../data/geometry';
import type { AppState } from '../types';
import { FloorPlanSvg } from './FloorPlanSvg';

type Props = {
  state: AppState;
  selectedBlockId: number | null;
  zoom: number;
  onSelectBlock: (blockId: number) => void;
};

export function FloorPlanMezzanine({
  state,
  selectedBlockId,
  zoom,
  onSelectBlock,
}: Props) {
  return (
    <FloorPlanSvg
      geometry={MEZZANINE_GEOMETRY}
      state={state}
      selectedBlockId={selectedBlockId}
      zoom={zoom}
      title="Auditorium Mezzanine"
      titleAccent="Mezzanine"
      accentClass="level-mezz"
      onSelectBlock={onSelectBlock}
    />
  );
}
