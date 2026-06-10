import { Slice, FlatSlice, TimelineEntry } from './types';

export function flattenTree(slices: Slice[], parentId: string | null = null, depth = 0): FlatSlice[] {
  return slices
    .filter((s) => s.parent_id === parentId)
    .sort((a, b) => a.order_index - b.order_index)
    .flatMap((s) => [
      { ...s, depth },
      ...flattenTree(slices, s.id, depth + 1),
    ]);
}

// Parse "12:00" → minutes offset (12:00=0, 12:30=30, 1:00=60, ..., 11:30=690)
export function parseStartTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return ((h % 12) * 60) + (m || 0);
}

// minutes offset → display string
export function formatMinutes(totalMin: number): string {
  const wrapped = ((totalMin % 720) + 720) % 720;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const displayH = h === 0 ? 12 : h;
  return `${displayH}:${m.toString().padStart(2, '0')}`;
}

export function buildTimeline(slices: Slice[], startingTime: string): TimelineEntry[] {
  let cursor = parseStartTime(startingTime);
  const result: TimelineEntry[] = [];

  function traverse(parentId: string | null, depth: number) {
    const children = slices
      .filter((s) => s.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);

    for (const slice of children) {
      const startMin = cursor;
      if (slice.enabled && slice.duration_minutes > 0) cursor += slice.duration_minutes;
      result.push({ ...slice, depth, startMinutes: startMin, endMinutes: cursor });
      traverse(slice.id, depth + 1);
    }
  }

  traverse(null, 0);
  return result;
}

export function getStartingTimeOptions(): string[] {
  const options: string[] = [];
  for (let h = 12; h !== 12 || options.length === 0; h = h === 11 ? 12 : (h % 12) + 1) {
    options.push(`${h}:00`);
    options.push(`${h}:30`);
    if (options.length >= 24) break;
  }
  return options;
}

// Returns IDs of slice + all its descendants
export function getDescendantIds(sliceId: string, slices: Slice[]): string[] {
  const children = slices.filter((s) => s.parent_id === sliceId);
  return [sliceId, ...children.flatMap((c) => getDescendantIds(c.id, slices))];
}
