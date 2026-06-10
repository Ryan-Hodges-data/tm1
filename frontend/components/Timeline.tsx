'use client';

import { Slice } from '@/lib/types';
import { buildTimeline, formatMinutes } from '@/lib/treeUtils';

interface Props {
  slices: Slice[];
  startingTime: string;
}

export default function Timeline({ slices, startingTime }: Props) {
  const entries = buildTimeline(slices, startingTime);

  if (entries.length === 0) {
    return (
      <div className="text-sm text-slate-400 text-center py-8">
        Add agenda items to see the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {entries.map((entry) => (
        <div
          key={entry.id}
          style={{ paddingLeft: entry.depth * 16 }}
          className={`flex items-baseline gap-2 py-1.5 ${entry.enabled ? '' : 'opacity-40'}`}
        >
          {entry.depth > 0 && (
            <span className="text-slate-300 text-xs flex-shrink-0">└</span>
          )}
          <div className="flex-1 min-w-0">
            <span className="text-sm text-slate-700 truncate block">
              {entry.role && <span className="text-slate-400 text-xs mr-1">{entry.role}</span>}
              {entry.user_name || <span className="text-slate-300 italic text-xs">unnamed</span>}
            </span>
          </div>
          <div className="text-right flex-shrink-0">
            {entry.enabled ? (
              <span className="text-xs text-slate-500 tabular-nums">
                {formatMinutes(entry.startMinutes)}
                {' – '}
                {formatMinutes(entry.endMinutes)}
              </span>
            ) : (
              <span className="text-xs text-slate-300 italic">disabled</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
