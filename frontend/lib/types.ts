export interface Slice {
  id: string;
  role: string;
  user_name: string;
  duration_minutes: number;
  enabled: boolean;
  parent_id: string | null;
  order_index: number;
}

export interface AgendaSettings {
  starting_time: string;
  title: string;
}

export interface FlatSlice extends Slice {
  depth: number;
}

export interface TimelineEntry extends FlatSlice {
  startMinutes: number;
  endMinutes: number;
}
