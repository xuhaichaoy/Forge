import type { TurnGroup } from "./turn-collapse-projection";

export const DESKTOP_TURN_ESTIMATED_HEIGHT_PX = 280;
export const DESKTOP_TURN_GAP_PX = 12;
export const DESKTOP_TURN_OVERSCAN = 2;
export const DESKTOP_STICKY_BOTTOM_THRESHOLD_PX = 24;

export interface VirtualTurnRange {
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
  totalHeight: number;
}

export function virtualTurnRange(input: {
  count: number;
  heights: ReadonlyMap<number, number>;
  scrollTop: number;
  viewportHeight: number;
  estimatedHeight?: number;
  gap?: number;
  overscan?: number;
}): VirtualTurnRange {
  const count = Math.max(0, input.count);
  const estimatedHeight = input.estimatedHeight ?? DESKTOP_TURN_ESTIMATED_HEIGHT_PX;
  const gap = input.gap ?? DESKTOP_TURN_GAP_PX;
  const overscan = input.overscan ?? DESKTOP_TURN_OVERSCAN;
  if (count === 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
  }

  const viewportHeight = Math.max(1, input.viewportHeight || 900);
  const viewportTop = Math.max(0, input.scrollTop);
  const viewportBottom = viewportTop + viewportHeight;
  const offsets = turnOffsets(count, input.heights, estimatedHeight, gap);
  let firstVisible = 0;
  let lastVisible = count - 1;

  for (let index = 0; index < count; index += 1) {
    const rowBottom = offsets[index] + turnHeight(input.heights, index, estimatedHeight);
    if (rowBottom >= viewportTop) {
      firstVisible = index;
      break;
    }
  }

  for (let index = firstVisible; index < count; index += 1) {
    if (offsets[index] > viewportBottom) {
      lastVisible = Math.max(firstVisible, index - 1);
      break;
    }
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(count, lastVisible + overscan + 1);
  const totalHeight = offsets[count - 1] + turnHeight(input.heights, count - 1, estimatedHeight);
  const paddingTop = offsets[startIndex] ?? 0;
  const afterLastRendered = endIndex >= count
    ? totalHeight
    : offsets[endIndex];
  const paddingBottom = Math.max(0, totalHeight - afterLastRendered);
  return { startIndex, endIndex, paddingTop, paddingBottom, totalHeight };
}

export function virtualTurnRangeFromBottom(input: {
  turnKeys: readonly string[];
  heights: ReadonlyMap<string, number>;
  distanceFromBottom: number;
  viewportHeight: number;
  estimatedHeight?: number;
  gap?: number;
  overscan?: number;
}): VirtualTurnRange {
  const turnKeys = input.turnKeys;
  const count = turnKeys.length;
  const estimatedHeight = input.estimatedHeight ?? DESKTOP_TURN_ESTIMATED_HEIGHT_PX;
  const gap = input.gap ?? DESKTOP_TURN_GAP_PX;
  const overscan = input.overscan ?? DESKTOP_TURN_OVERSCAN;
  if (count === 0) {
    return { startIndex: 0, endIndex: 0, paddingTop: 0, paddingBottom: 0, totalHeight: 0 };
  }

  const viewportHeight = Math.max(1, input.viewportHeight || 900);
  const viewportBottomDistance = Math.max(0, input.distanceFromBottom);
  const viewportTopDistance = viewportBottomDistance + viewportHeight;
  const offsets = turnOffsetsByKey(turnKeys, input.heights, estimatedHeight, gap);
  const totalHeight = offsets[count - 1] + turnHeightByKey(input.heights, turnKeys[count - 1], estimatedHeight);
  let firstVisible = -1;
  let lastVisible = -1;

  for (let index = 0; index < count; index += 1) {
    const top = offsets[index] ?? 0;
    const height = turnHeightByKey(input.heights, turnKeys[index], estimatedHeight);
    const rowBottomDistance = Math.max(0, totalHeight - (top + height));
    const rowTopDistance = Math.max(rowBottomDistance, totalHeight - top);
    const visible = rowTopDistance >= viewportBottomDistance && rowBottomDistance <= viewportTopDistance;
    if (!visible) continue;
    if (firstVisible < 0) firstVisible = index;
    lastVisible = index;
  }

  if (firstVisible < 0 || lastVisible < 0) {
    if (viewportBottomDistance > totalHeight) {
      firstVisible = 0;
      lastVisible = 0;
    } else {
      firstVisible = count - 1;
      lastVisible = count - 1;
    }
  }

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(count, lastVisible + overscan + 1);
  const paddingTop = offsets[startIndex] ?? 0;
  const afterLastRendered = endIndex >= count ? totalHeight : offsets[endIndex] ?? totalHeight;
  const paddingBottom = Math.max(0, totalHeight - afterLastRendered);
  return { startIndex, endIndex, paddingTop, paddingBottom, totalHeight };
}

function turnOffsets(
  count: number,
  heights: ReadonlyMap<number, number>,
  estimatedHeight: number,
  gap: number,
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let index = 0; index < count; index += 1) {
    offsets.push(offset);
    offset += turnHeight(heights, index, estimatedHeight) + (index === count - 1 ? 0 : gap);
  }
  return offsets;
}

function turnHeight(heights: ReadonlyMap<number, number>, index: number, estimatedHeight: number): number {
  const measured = heights.get(index);
  return measured && measured > 0 ? measured : estimatedHeight;
}

export function turnOffsetsByKey(
  turnKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimatedHeight: number,
  gap: number,
): number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (let index = 0; index < turnKeys.length; index += 1) {
    offsets.push(offset);
    offset += turnHeightByKey(heights, turnKeys[index], estimatedHeight) + (index === turnKeys.length - 1 ? 0 : gap);
  }
  return offsets;
}

export function turnHeightByKey(heights: ReadonlyMap<string, number>, turnKey: string | undefined, estimatedHeight: number): number {
  const measured = turnKey ? heights.get(turnKey) : undefined;
  return measured && measured > 0 ? measured : estimatedHeight;
}

export function turnBottomDistanceFromBottom(
  turnKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  index: number,
  estimatedHeight = DESKTOP_TURN_ESTIMATED_HEIGHT_PX,
  gap = DESKTOP_TURN_GAP_PX,
): number {
  if (index < 0 || index >= turnKeys.length) return 0;
  const offsets = turnOffsetsByKey(turnKeys, heights, estimatedHeight, gap);
  const totalHeight = offsets[turnKeys.length - 1] + turnHeightByKey(heights, turnKeys[turnKeys.length - 1], estimatedHeight);
  const top = offsets[index] ?? 0;
  const height = turnHeightByKey(heights, turnKeys[index], estimatedHeight);
  return Math.max(0, totalHeight - (top + height));
}

export function turnKeysForGroups(groups: TurnGroup[]): string[] {
  const seenTurnIds = new Map<string, number>();
  return groups.map((group, index) => {
    if (!group.turnId) return turnKeyForGroup(group, index);
    const occurrence = seenTurnIds.get(group.turnId) ?? 0;
    seenTurnIds.set(group.turnId, occurrence + 1);
    return occurrence === 0 ? group.turnId : `${group.turnId}:${occurrence}`;
  });
}

export function turnKeyForGroup(group: TurnGroup, index: number): string {
  return group.turnId ?? `untracked:${index}`;
}
