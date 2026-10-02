export type CohortSummary = {
  id: string;
  name: string;
  institution_id: string;
  definition: Record<string, string | number | boolean>;
  metric_version: string;
  privacy_threshold: number;
  privacy_status: "eligible" | "below_threshold";
};

export type AggregateTrendPoint = { period: string; value: number | null; suppressed: boolean };

export type AggregateMetric = {
  key: string;
  label: string;
  category: string;
  unit: string;
  value: number | null;
  sample_size: number | null;
  suppressed: boolean;
  suppression_reason: string | null;
  definition: string;
  formula: string;
  trend: AggregateTrendPoint[];
};

export type AggregateSlice = {
  metric_key: string;
  dimension_key: string;
  dimension_label: string;
  value: number | null;
  unit: string;
  sample_size: number | null;
  suppressed: boolean;
  suppression_reason: string | null;
};

export type InstitutionalDashboard = {
  cohort: CohortSummary;
  start_date: string;
  end_date: string;
  timezone: string;
  metrics: AggregateMetric[];
  skill_slices: AggregateSlice[];
  freshness: {
    refreshed_at: string | null;
    source_latest_at: string | null;
    metric_version: string;
    is_stale: boolean;
    retention_days: number;
    purpose: string;
  };
  capabilities: { can_export: boolean; can_refresh: boolean };
  empty: boolean;
  message: string | null;
  governance_notice: string;
};

export type MetricDefinition = {
  key: string;
  label: string;
  category: string;
  unit: string;
  formula: string;
  explanation: string;
  source_domains: string[];
  metric_version: string;
  approved: boolean;
  approved_purpose: string;
};

export type Governance = {
  purpose: string;
  retention_days: number;
  privacy_threshold: number;
  metric_version: string;
  approved_metrics: string[];
  prohibited_uses: string[];
};

export function isCohortList(value: unknown): value is CohortSummary[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as CohortSummary).id === "string" && typeof (item as CohortSummary).name === "string");
}

export function isInstitutionalDashboard(value: unknown): value is InstitutionalDashboard {
  if (!value || typeof value !== "object") return false;
  const dashboard = value as InstitutionalDashboard;
  return Boolean(dashboard.cohort?.id) && Array.isArray(dashboard.metrics) && Array.isArray(dashboard.skill_slices) && typeof dashboard.freshness?.metric_version === "string";
}

export function isMetricDefinitionList(value: unknown): value is MetricDefinition[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && typeof (item as MetricDefinition).key === "string");
}

export function isGovernance(value: unknown): value is Governance {
  if (!value || typeof value !== "object") return false;
  const governance = value as Governance;
  return typeof governance.purpose === "string" && Array.isArray(governance.approved_metrics) && Array.isArray(governance.prohibited_uses);
}
