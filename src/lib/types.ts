export type BooleanInt = 0 | 1;

export type Pen = {
  id: number;
  opened_on: string | null;
  total_mg: number;
  mg_remaining: number;
  lot: string | null;
  source: string | null;
  is_active: BooleanInt;
  created_at: string | null;
};

export type Injection = {
  id: number;
  ts: string;
  dose_mg: number;
  clicks: number;
  site: string | null;
  pen_id: number | null;
  notes: string | null;
};

export type Symptom = {
  id: number;
  ts: string;
  category: string;
  severity: number;
  vomit: BooleanInt;
  note: string | null;
};

export type DailyVital = {
  date: string;
  rhr: number | null;
  hrv: number | null;
  note: string | null;
};

export type WeeklyMetric = {
  week_start: string;
  weight_kg: number | null;
  avg_rhr: number | null;
  avg_hrv: number | null;
  note: string | null;
};

export type ProtocolState = {
  id: number;
  current_week: number;
  current_dose_mg: number;
  current_step: number;
  next_dose_due: string | null;
  escalation_locked_until_week: number | null;
  started_on: string;
  injection_weekday: number | null;
};

export type SchemaVersion = {
  version: number;
};

export type WhoopSyncLog = {
  id: number;
  synced_at: string | null;
  status: string | null;
  message: string | null;
};

export type RetaSnapshot = {
  pens: Pen[];
  injections: Injection[];
  symptoms: Symptom[];
  daily_vitals: DailyVital[];
  weekly_metrics: WeeklyMetric[];
  protocol_state: ProtocolState[];
  schema_version: SchemaVersion[];
  whoop_sync_log?: WhoopSyncLog[];
};
