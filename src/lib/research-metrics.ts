export type MetricGoal = {
  direction: string;
  baseline: number | null;
  target: number;
  target_max?: number | null;
};
export function metricProgress(metric: MetricGoal, value: number | null) {
  if (value === null || !Number.isFinite(value))
    return { progress_percent: null, target_gap: null };
  const { baseline, target, direction } = metric;
  const gap =
    direction === "range"
      ? value < target
        ? target - value
        : value > (metric.target_max ?? target)
          ? value - (metric.target_max ?? target)
          : 0
      : direction === "minimize"
        ? value - target
        : target - value;
  if (baseline === null || !Number.isFinite(baseline))
    return { progress_percent: null, target_gap: gap };
  const denominator =
    direction === "minimize" ? baseline - target : target - baseline;
  if (direction === "range" || denominator <= 0)
    return { progress_percent: null, target_gap: gap };
  const improvement =
    direction === "minimize" ? baseline - value : value - baseline;
  return {
    progress_percent: Math.max(
      0,
      Math.min(100, (improvement / denominator) * 100),
    ),
    target_gap: gap,
  };
}
export function compatibleObservation(
  metric: { id: string; unit: string; evaluation_protocol: string },
  observation: {
    metric_id: string | null;
    unit: string;
    conditions_key: string;
  },
) {
  return (
    observation.metric_id === metric.id &&
    observation.unit === metric.unit &&
    observation.conditions_key === metric.evaluation_protocol
  );
}
