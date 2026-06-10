import { Slice, AgendaSettings } from './types';

const BASE = '/api';

export async function fetchAgenda(): Promise<{ slices: Slice[]; settings: AgendaSettings }> {
  const res = await fetch(`${BASE}/agenda`);
  if (!res.ok) throw new Error('Failed to fetch agenda');
  return res.json();
}

export async function createSlice(data: Partial<Slice>): Promise<Slice> {
  const res = await fetch(`${BASE}/slices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function updateSlice(id: string, data: Partial<Slice>): Promise<Slice> {
  const res = await fetch(`${BASE}/slices/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSlice(id: string): Promise<void> {
  await fetch(`${BASE}/slices/${id}`, { method: 'DELETE' });
}

export async function reorderSlices(
  items: Array<{ id: string; parent_id: string | null; order_index: number }>
): Promise<void> {
  await fetch(`${BASE}/reorder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(items),
  });
}

export async function updateSettings(settings: Partial<AgendaSettings>): Promise<void> {
  await fetch(`${BASE}/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}
