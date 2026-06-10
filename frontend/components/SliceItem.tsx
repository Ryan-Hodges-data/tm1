'use client';

import { useRef, useState, useCallback } from 'react';
import { Slice } from '@/lib/types';

interface DropZone {
  id: string;
  zone: 'before' | 'inside' | 'after';
}

interface Props {
  slice: Slice;
  depth: number;
  isDragging: boolean;
  dropTarget: DropZone | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDragOver: (zone: DropZone) => void;
  onDrop: (targetId: string, zone: 'before' | 'inside' | 'after') => void;
  onChange: (id: string, fields: Partial<Slice>) => void;
  onDelete: (id: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
  children?: React.ReactNode;
}

export default function SliceItem({
  slice,
  depth,
  isDragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onChange,
  onDelete,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  isSelected,
  onToggleSelect,
  children,
}: Props) {
  const [localRole, setLocalRole] = useState(slice.role);
  const [localName, setLocalName] = useState(slice.user_name);
  const [localDuration, setLocalDuration] = useState(String(slice.duration_minutes));
  const debounceRef = useRef<NodeJS.Timeout>();

  const debounce = useCallback((fn: () => void) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fn, 400);
  }, []);

  const isDropBefore = dropTarget?.id === slice.id && dropTarget.zone === 'before';
  const isDropInside = dropTarget?.id === slice.id && dropTarget.zone === 'inside';
  const isDropAfter = dropTarget?.id === slice.id && dropTarget.zone === 'after';
  const isEffectivelyDisabled = !slice.enabled || slice.duration_minutes === 0;

  const indent = depth * 24;

  return (
    <div
      className={isDragging ? 'dragging' : ''}
      style={{ paddingLeft: indent }}
    >
      {/* Before drop strip */}
      <div
        className={`h-1 rounded transition-colors ${isDropBefore ? 'bg-blue-500' : 'bg-transparent'}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver({ id: slice.id, zone: 'before' }); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(slice.id, 'before'); }}
      />

      {/* Main slice body */}
      <div
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 mb-0.5 transition-all
          ${isSelected ? 'bg-blue-50 border-blue-200' : 'bg-white'}
          ${!isSelected && !isEffectivelyDisabled ? 'border-slate-200' : ''}
          ${isEffectivelyDisabled ? 'opacity-50' : ''}
          ${isDropInside ? 'drag-over-inside' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver({ id: slice.id, zone: 'inside' }); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(slice.id, 'inside'); }}
      >
        {/* Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(slice.id)}
          className="flex-shrink-0 w-3.5 h-3.5 rounded accent-blue-500 cursor-pointer"
          onClick={(e) => e.stopPropagation()}
        />

        {/* Drag handle */}
        <div
          className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 flex-shrink-0 select-none"
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            onDragStart(slice.id);
          }}
          onDragEnd={onDragEnd}
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" />
            <circle cx="9" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" />
            <circle cx="9" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" />
            <circle cx="9" cy="13" r="1.5" />
          </svg>
        </div>

        {/* Up/down */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-default transition-colors leading-none"
            title="Move up"
          >
            <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor">
              <path d="M5 0L10 7H0L5 0Z" />
            </svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-default transition-colors leading-none"
            title="Move down"
          >
            <svg width="10" height="7" viewBox="0 0 10 7" fill="currentColor">
              <path d="M5 7L0 0H10L5 7Z" />
            </svg>
          </button>
        </div>

        {/* Toggle */}
        <button
          onClick={() => onChange(slice.id, { enabled: !slice.enabled })}
          className={`flex-shrink-0 w-8 h-4 rounded-full transition-colors ${
            slice.enabled ? 'bg-blue-500' : 'bg-slate-200'
          }`}
          title={slice.enabled ? 'Disable' : 'Enable'}
        >
          <span
            className={`block w-3 h-3 rounded-full bg-white shadow transition-transform mx-0.5 ${
              slice.enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>

        {/* Role */}
        <input
          type="text"
          value={localRole}
          placeholder="Role"
          className="w-28 text-sm border border-transparent rounded px-1.5 py-0.5 hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent"
          onChange={(e) => {
            setLocalRole(e.target.value);
            debounce(() => onChange(slice.id, { role: e.target.value }));
          }}
        />

        {/* Name */}
        <input
          type="text"
          value={localName}
          placeholder="Name"
          className="flex-1 min-w-0 text-sm border border-transparent rounded px-1.5 py-0.5 hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent"
          onChange={(e) => {
            setLocalName(e.target.value);
            debounce(() => onChange(slice.id, { user_name: e.target.value }));
          }}
        />

        {/* Duration */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <input
            type="number"
            value={localDuration}
            min="0"
            max="60"
            className="w-12 text-sm text-right border border-transparent rounded px-1.5 py-0.5 hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent"
            onChange={(e) => {
              setLocalDuration(e.target.value);
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 0 && val <= 60) {
                debounce(() => onChange(slice.id, { duration_minutes: val }));
              }
            }}
            onBlur={() => {
              const val = parseInt(localDuration, 10);
              if (isNaN(val) || val < 0) {
                setLocalDuration(String(slice.duration_minutes));
              }
            }}
          />
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => {
                const val = Math.min(60, (parseInt(localDuration, 10) || 0) + 1);
                setLocalDuration(String(val));
                onChange(slice.id, { duration_minutes: val });
              }}
              disabled={parseInt(localDuration, 10) >= 60}
              className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-default transition-colors leading-none"
              title="Increase"
            >
              <svg width="8" height="6" viewBox="0 0 10 7" fill="currentColor">
                <path d="M5 0L10 7H0L5 0Z" />
              </svg>
            </button>
            <button
              onClick={() => {
                const val = Math.max(0, (parseInt(localDuration, 10) || 0) - 1);
                setLocalDuration(String(val));
                onChange(slice.id, { duration_minutes: val });
              }}
              disabled={parseInt(localDuration, 10) <= 0}
              className="text-slate-300 hover:text-slate-500 disabled:opacity-20 disabled:cursor-default transition-colors leading-none"
              title="Decrease"
            >
              <svg width="8" height="6" viewBox="0 0 10 7" fill="currentColor">
                <path d="M5 7L0 0H10L5 7Z" />
              </svg>
            </button>
          </div>
          <span className="text-xs text-slate-400">min</span>
        </div>

        {/* Delete */}
        <button
          onClick={() => onDelete(slice.id)}
          className="flex-shrink-0 text-slate-300 hover:text-red-400 transition-colors p-0.5"
          title="Delete"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="2" y1="2" x2="12" y2="12" />
            <line x1="12" y1="2" x2="2" y2="12" />
          </svg>
        </button>
      </div>

      {/* After drop strip */}
      <div
        className={`h-1 rounded transition-colors ${isDropAfter ? 'bg-blue-500' : 'bg-transparent'}`}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver({ id: slice.id, zone: 'after' }); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(slice.id, 'after'); }}
      />

      {/* Children */}
      {children}
    </div>
  );
}
