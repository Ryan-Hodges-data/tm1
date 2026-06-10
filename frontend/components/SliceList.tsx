'use client';

import { useState, useCallback } from 'react';
import { Slice } from '@/lib/types';
import { getDescendantIds } from '@/lib/treeUtils';
import SliceItem from './SliceItem';

interface DropZone {
  id: string;
  zone: 'before' | 'inside' | 'after';
}

interface Props {
  slices: Slice[];
  onSlicesChange: (slices: Slice[]) => void;
  onChange: (id: string, fields: Partial<Slice>) => void;
  onDelete: (id: string) => void;
}

export default function SliceList({ slices, onSlicesChange, onChange, onDelete }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropZone | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleDragStart = useCallback((id: string) => {
    setDragId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((zone: DropZone) => {
    setDropTarget(zone);
  }, []);

  const handleMove = useCallback(
    (id: string, direction: 'up' | 'down', parentId: string | null) => {
      const siblings = slices
        .filter((s) => s.parent_id === parentId)
        .sort((a, b) => a.order_index - b.order_index);

      const reordered = [...siblings];
      const isGroupMove = selectedIds.has(id);

      if (isGroupMove) {
        // Collect selected slice IDs present at this level
        const selectedAtLevel = new Set(reordered.filter((s) => selectedIds.has(s.id)).map((s) => s.id));
        if (direction === 'up') {
          // Process front-to-back so the block moves as a unit
          for (let i = 0; i < reordered.length; i++) {
            if (selectedAtLevel.has(reordered[i].id) && i > 0 && !selectedAtLevel.has(reordered[i - 1].id)) {
              [reordered[i - 1], reordered[i]] = [reordered[i], reordered[i - 1]];
            }
          }
        } else {
          // Process back-to-front
          for (let i = reordered.length - 1; i >= 0; i--) {
            if (selectedAtLevel.has(reordered[i].id) && i < reordered.length - 1 && !selectedAtLevel.has(reordered[i + 1].id)) {
              [reordered[i], reordered[i + 1]] = [reordered[i + 1], reordered[i]];
            }
          }
        }
      } else {
        const idx = reordered.findIndex((s) => s.id === id);
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= reordered.length) return;
        [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
      }

      const updates = new Map(reordered.map((s, i) => [s.id, { order_index: i }]));
      onSlicesChange(slices.map((s) => {
        const patch = updates.get(s.id);
        return patch ? { ...s, ...patch } : s;
      }));
    },
    [slices, onSlicesChange, selectedIds]
  );

  const handleDrop = useCallback(
    (targetId: string, zone: 'before' | 'inside' | 'after') => {
      if (!dragId || dragId === targetId) {
        setDragId(null);
        setDropTarget(null);
        return;
      }

      const descendants = getDescendantIds(dragId, slices);
      if (zone === 'inside' && descendants.includes(targetId)) {
        setDragId(null);
        setDropTarget(null);
        return;
      }

      const dragSlice = slices.find((s) => s.id === dragId)!;
      const targetSlice = slices.find((s) => s.id === targetId)!;
      const updates = new Map<string, Partial<Slice>>();

      if (zone === 'inside') {
        // Append at the end of existing children
        const existingChildren = slices
          .filter((s) => s.parent_id === targetId && s.id !== dragId)
          .sort((a, b) => a.order_index - b.order_index);
        existingChildren.forEach((s, i) => updates.set(s.id, { order_index: i }));
        updates.set(dragId, { parent_id: targetId, order_index: existingChildren.length });
      } else {
        const newParentId = targetSlice.parent_id;
        const siblings = slices
          .filter((s) => s.parent_id === newParentId && s.id !== dragId)
          .sort((a, b) => a.order_index - b.order_index);
        const insertIdx = siblings.findIndex((s) => s.id === targetId);
        const insertAt = zone === 'before' ? insertIdx : insertIdx + 1;
        const withDrag = [...siblings];
        withDrag.splice(insertAt, 0, dragSlice);
        withDrag.forEach((s, i) =>
          updates.set(s.id, { ...updates.get(s.id), parent_id: newParentId, order_index: i })
        );
      }

      onSlicesChange(slices.map((s) => {
        const patch = updates.get(s.id);
        return patch ? { ...s, ...patch } : s;
      }));
      setDragId(null);
      setDropTarget(null);
    },
    [dragId, slices, onSlicesChange]
  );

  function renderSlices(parentId: string | null, depth: number): React.ReactNode {
    const children = slices
      .filter((s) => s.parent_id === parentId)
      .sort((a, b) => a.order_index - b.order_index);

    return children.map((slice, idx) => (
      <SliceItem
        key={slice.id}
        slice={slice}
        depth={depth}
        isDragging={dragId === slice.id}
        dropTarget={dropTarget}
        isSelected={selectedIds.has(slice.id)}
        onToggleSelect={handleToggleSelect}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onChange={onChange}
        onDelete={onDelete}
        canMoveUp={idx > 0}
        canMoveDown={idx < children.length - 1}
        onMoveUp={() => handleMove(slice.id, 'up', slice.parent_id)}
        onMoveDown={() => handleMove(slice.id, 'down', slice.parent_id)}
      >
        {renderSlices(slice.id, depth + 1)}
      </SliceItem>
    ));
  }

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDropTarget(null);
        }
      }}
    >
      {selectedIds.size > 1 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs text-blue-600 font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Clear selection
          </button>
        </div>
      )}
      {renderSlices(null, 0)}
    </div>
  );
}
