import type { Experiment } from "./experiments";
import { clip, experimentSummary } from "./campaigns";
export function overview(e: Experiment) {
  return {
    ...experimentSummary(e),
    replication_of: e.replication_of,
    replication_reason: clip(e.replication_reason, 160),
    reproduced_count: e.reproduced_count,
    not_reproduced_count: e.not_reproduced_count,
    hypothesis: clip(e.hypothesis, 240),
    conditions: clip(e.conditions, 200),
    observations: clip(e.observations, 300),
    metrics: e.metrics
      .slice(0, 5)
      .map((m) => ({ ...m, name: clip(m.name, 40), unit: clip(m.unit, 20) })),
    created_at: e.created_at,
    started_at: e.started_at,
    completed_at: e.completed_at,
    available_sections: ["protocol", "result"],
  };
}
export function textChunk(value: unknown, offset = 0, maxChars = 4000) {
  const content = JSON.stringify(value, null, 2);
  return {
    format: "json_fragment",
    content: content.slice(offset, offset + maxChars),
    offset,
    next_offset: offset + maxChars < content.length ? offset + maxChars : null,
    total_chars: content.length,
    truncated: offset + maxChars < content.length,
  };
}
export function experimentSection(
  e: Experiment,
  section: "protocol" | "result",
  offset: number,
  maxChars: number,
) {
  return {
    id: e.id,
    section,
    ...textChunk(
      section === "protocol"
        ? {
            id: e.id,
            title: e.title,
            question: e.question,
            hypothesis: e.hypothesis,
            method: e.method,
            inputs: e.inputs,
            conditions: e.conditions,
            success_criteria: e.success_criteria,
          }
        : {
            id: e.id,
            status: e.status,
            outcome: e.outcome,
            observations: e.observations,
            evidence: e.evidence,
            limitations: e.limitations,
            metrics: e.metrics,
            artifacts: e.artifacts,
          },
      offset,
      maxChars,
    ),
  };
}
