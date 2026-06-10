'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Slice, AgendaSettings } from '@/lib/types';
import { getStartingTimeOptions } from '@/lib/treeUtils';
import * as api from '@/lib/api';
import SliceList from '@/components/SliceList';
import Timeline from '@/components/Timeline';

export default function Home() {
  const [slices, setSlices] = useState<Slice[]>([]);
  const [settings, setSettings] = useState<AgendaSettings>({ starting_time: '9:00', title: 'Meeting Agenda' });
  const [localTitle, setLocalTitle] = useState('Meeting Agenda');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reorderDebounce = useRef<NodeJS.Timeout>();
  const titleDebounce = useRef<NodeJS.Timeout>();

  useEffect(() => {
    api.fetchAgenda()
      .then(({ slices, settings }) => {
        setSlices(slices);
        setSettings(settings);
        setLocalTitle(settings.title ?? 'Meeting Agenda');
        setLoaded(true);
      })
      .catch(() => setError('Failed to load agenda. Is the server running?'));
  }, []);

  const handleAdd = useCallback(async () => {
    const maxOrder = slices.filter((s) => !s.parent_id).reduce(
      (max, s) => Math.max(max, s.order_index),
      -1
    );
    try {
      const created = await api.createSlice({
        role: '',
        user_name: '',
        duration_minutes: 5,
        enabled: true,
        parent_id: null,
        order_index: maxOrder + 1,
      });
      setSlices((prev) => [...prev, created]);
    } catch {
      setError('Failed to add item.');
    }
  }, [slices]);

  const handleChange = useCallback(async (id: string, fields: Partial<Slice>) => {
    setSlices((prev) => prev.map((s) => (s.id === id ? { ...s, ...fields } : s)));
    try {
      await api.updateSlice(id, fields);
    } catch {
      setError('Failed to save changes.');
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    // Optimistically remove the slice and all its descendants from local state
    const idsToRemove = new Set<string>();
    function collectIds(sid: string) {
      idsToRemove.add(sid);
      slices.filter((s) => s.parent_id === sid).forEach((c) => collectIds(c.id));
    }
    collectIds(id);
    setSlices((prev) => prev.filter((s) => !idsToRemove.has(s.id)));
    try {
      await api.deleteSlice(id);
    } catch {
      setError('Failed to delete item.');
    }
  }, [slices]);

  const handleSlicesChange = useCallback((updated: Slice[]) => {
    setSlices(updated);
    clearTimeout(reorderDebounce.current);
    reorderDebounce.current = setTimeout(() => {
      api.reorderSlices(
        updated.map((s) => ({ id: s.id, parent_id: s.parent_id, order_index: s.order_index }))
      ).catch(() => setError('Failed to save order.'));
    }, 300);
  }, []);

  const handleTitleChange = useCallback((title: string) => {
    setLocalTitle(title);
    setSettings((prev) => ({ ...prev, title }));
    clearTimeout(titleDebounce.current);
    titleDebounce.current = setTimeout(() => {
      api.updateSettings({ title }).catch(() => setError('Failed to save title.'));
    }, 400);
  }, []);

  const handleStartingTimeChange = useCallback(async (time: string) => {
    setSettings((prev) => ({ ...prev, starting_time: time }));
    try {
      await api.updateSettings({ starting_time: time });
    } catch {
      setError('Failed to save settings.');
    }
  }, []);

  const startTimeOptions = getStartingTimeOptions();

  if (!loaded && !error) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-400 text-sm">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-6">
          <input
            type="text"
            value={localTitle}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Meeting title"
            className="text-lg font-semibold text-slate-800 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none px-0.5 flex-1 min-w-0"
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            <label className="text-sm text-slate-500">Start:</label>
            <select
              value={settings.starting_time}
              onChange={(e) => handleStartingTimeChange(e.target.value)}
              className="text-sm border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-blue-400"
            >
              {startTimeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {error && (
        <div className="bg-red-50 border-b border-red-100 px-6 py-2 text-sm text-red-600 flex items-center justify-between max-w-5xl mx-auto mt-2 rounded">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex gap-6">
          {/* Left: agenda */}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Agenda</h2>

            {slices.length === 0 ? (
              <div className="text-center py-16 text-slate-400 text-sm">
                <p>No agenda items yet.</p>
                <p className="mt-1">Click &ldquo;+ Add&rdquo; below to get started.</p>
              </div>
            ) : (
              <SliceList
                slices={slices}
                onSlicesChange={handleSlicesChange}
                onChange={handleChange}
                onDelete={handleDelete}
              />
            )}

            <div className="mt-3">
              <button
                onClick={handleAdd}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-dashed border-slate-300 hover:border-blue-300 w-full justify-center"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="6" y1="1" x2="6" y2="11" />
                  <line x1="1" y1="6" x2="11" y2="6" />
                </svg>
                Add
              </button>
            </div>
          </div>

          {/* Right: timeline */}
          <div className="w-80 flex-shrink-0">
            <div className="sticky top-6">
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-4">Timeline</h2>
              <div className="bg-white border border-slate-200 rounded-lg p-4">
                <Timeline slices={slices} startingTime={settings.starting_time} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
