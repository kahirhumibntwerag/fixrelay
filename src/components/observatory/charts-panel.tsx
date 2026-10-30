"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Upload, X } from "lucide-react";
import type { ResearchChart, Snapshot } from "./types";
import "./metrics-charts.css";
import { formatResearchText } from "@/lib/research-text";

const maxBytes = 2 * 1024 * 1024;
const imageTypes = ["image/png", "image/jpeg", "image/webp"];

export function ChartsPanel({
  data,
  onUpdated,
}: {
  data: Snapshot;
  onUpdated: () => void;
}) {
  const [charts, setCharts] = useState<ResearchChart[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reload, setReload] = useState(0);
  const attempt = useRef({ fingerprint: "", key: "" });
  const eventVersion = data.events.at(-1)?.id;
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/research/charts?campaign_id=${encodeURIComponent(data.campaign.id)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Unable to load charts.");
        return body;
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          setCharts(body.charts || []);
          setError("");
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Unable to load charts.",
          );
      });
    return () => controller.abort();
  }, [data.campaign.id, eventVersion, reload]);

  async function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file");
    setSuccess("");
    setError("");
    if (!(file instanceof File) || !file.size) {
      setError("Choose a chart image.");
      return;
    }
    if (!imageTypes.includes(file.type)) {
      setError("Choose a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      setError("The image must be 2 MB or smaller.");
      return;
    }
    setBusy(true);
    try {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        await file.arrayBuffer(),
      );
      const contentHash = Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const fingerprint = JSON.stringify({
        campaign_id: data.campaign.id,
        hash: contentHash,
        title: form.get("title"),
        caption: form.get("caption"),
        experiment_id: form.get("experiment_id"),
        metric_id: form.get("metric_id"),
      });
      if (attempt.current.fingerprint !== fingerprint)
        attempt.current = { fingerprint, key: crypto.randomUUID() };
      form.set("campaign_id", data.campaign.id);
      form.set("idempotency_key", attempt.current.key);
      for (const field of ["experiment_id", "metric_id"])
        if (!form.get(field)) form.delete(field);
      const response = await fetch("/api/research/charts", {
        method: "POST",
        body: form,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Unable to upload chart.");
      if (!body.chart?.id)
        throw new Error(
          "Chart upload returned no saved record. Refresh and try again.",
        );
      setCharts((items) => [
        body.chart,
        ...items.filter((item) => item.id !== body.chart.id),
      ]);
      setUploading(false);
      setSuccess(
        "Chart uploaded. It remains private until selected for publication.",
      );
      formElement.reset();
      onUpdated();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to upload chart.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="obs-card obs-charts-panel">
      <div className="obs-card-heading">
        <h2>Charts and graphs</h2>
        <button
          className="obs-link-button"
          onClick={() => {
            setUploading(!uploading);
            setError("");
            setSuccess("");
          }}
          aria-expanded={uploading}
        >
          <Upload size={17} /> Upload chart
        </button>
      </div>
      {uploading && (
        <form className="obs-chart-form" onSubmit={upload}>
          <div className="obs-card-heading">
            <h3>Upload chart</h3>
            <button
              type="button"
              className="obs-icon-button"
              onClick={() => setUploading(false)}
              aria-label="Close chart upload"
            >
              <X size={18} />
            </button>
          </div>
          <div className="obs-form-grid">
            <label className="obs-span-two">
              Image
              <input
                name="file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                required
              />
              <span className="obs-upload-hint">
                PNG, JPEG, or WebP · up to 2 MB
              </span>
            </label>
            <label className="obs-span-two">
              Title
              <input
                name="title"
                required
                maxLength={200}
                placeholder="e.g. Forecast error by year"
              />
            </label>
            <label className="obs-span-two">
              Caption (optional)
              <textarea
                name="caption"
                maxLength={4000}
                rows={3}
                placeholder="Explain what the chart shows."
              />
            </label>
            <label>
              Experiment (optional)
              <select name="experiment_id">
                <option value="">Campaign chart</option>
                {data.experiments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Metric (optional)
              <select name="metric_id">
                <option value="">No specific metric</option>
                {data.metrics.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="obs-form-actions">
            <button
              className="obs-button"
              type="button"
              onClick={() => setUploading(false)}
            >
              Cancel
            </button>
            <button className="obs-button obs-primary" disabled={busy}>
              {busy ? "Uploading…" : "Upload chart"}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="obs-chart-error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="obs-link-button"
            onClick={() => setReload((value) => value + 1)}
          >
            Retry loading charts
          </button>
        </div>
      )}
      {success && (
        <p className="obs-chart-success" role="status">
          {success}
        </p>
      )}
      {charts.length ? (
        <div className="obs-chart-gallery">
          {charts.map((chart) => (
            <figure key={chart.id}>
              <a
                href={chart.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open chart: ${chart.title}`}
              >
                {/* Private images use the browser's same-origin session directly. */}
                <img
                  src={chart.url}
                  alt={chart.title}
                  loading="lazy"
                  decoding="async"
                />
              </a>
              <figcaption>
                <div className="obs-card-heading">
                  <h3>{formatResearchText(chart.title)}</h3>
                  <a
                    className="obs-link-button"
                    href={chart.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open full-size chart: ${chart.title}`}
                  >
                    <ArrowUpRight size={18} />
                  </a>
                </div>
                {chart.caption && <p>{formatResearchText(chart.caption)}</p>}
                {(chart.experiment_id || chart.metric_id) && (
                  <p className="obs-chart-association">
                    {[
                      data.experiments.find(
                        (item) => item.id === chart.experiment_id,
                      )?.title,
                      data.metrics.find(
                        (metric) => metric.id === chart.metric_id,
                      )?.name,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                <span className="obs-subtle-label">
                  {chart.is_public ? "Public" : "Private"}
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : (
        !error && (
          <p className="obs-muted">
            Upload a chart to show it alongside your metrics.
          </p>
        )
      )}
    </section>
  );
}
