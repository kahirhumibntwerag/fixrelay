"use client";

import { useEffect, useMemo, useState } from "react";
import { date, numeric, type Snapshot } from "./types";
import { RemoveResearchItem } from "./remove-research-item";
import "./metrics-charts.css";

type Chart = {id:string; campaign_id:string; title:string; caption:string; x_label:string; y_label:string; unit:string; chart_type:"line"|"scatter"|"bar"; is_public:boolean; published_at:string|null; point_count:number};
type Point = {id:string; series:string; x:number; y:number; observed_at:string; run_id:string|null; note:string};
const colors = ["#83bce5", "#b5ed83", "#f0b67f", "#d4a7ed", "#75d5cc", "#f28f9d"];

export function SeriesChartsPanel({data,onUpdated}:{data:Snapshot;onUpdated:()=>void}) {
  const [charts,setCharts] = useState<Chart[]>([]), [error,setError] = useState(""), [next,setNext] = useState<number|null>(null);
  const eventVersion = data.events.at(-1)?.id;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research/series?campaign_id=${encodeURIComponent(data.campaign.id)}`,{signal:controller.signal,cache:"no-store"}).then(async response => {const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load interactive charts."); return body;}).then(body => {if (!controller.signal.aborted) {setCharts(body.charts);setNext(body.next_offset);setError("");}}).catch(cause => {if (!controller.signal.aborted) setError(cause.message);});
    return () => controller.abort();
  },[data.campaign.id,eventVersion]);
  async function loadMore() {try {const response = await fetch(`/api/research/series?campaign_id=${encodeURIComponent(data.campaign.id)}&offset=${next}`); const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load charts."); setCharts(items => [...items,...body.charts.filter((chart:Chart) => !items.some(item => item.id === chart.id))]);setNext(body.next_offset);} catch(cause) {setError(cause instanceof Error ? cause.message : "Unable to load charts.");}}
  return <section className="obs-card"><div className="obs-card-heading"><div><h2>Interactive charts</h2><p className="obs-muted">Compare runs and explore measurements over time.</p></div></div>
    {error && <p role="alert" className="obs-form-error">{error}</p>}
    {charts.map(chart => <SeriesChart key={chart.id} chart={chart} data={data} onUpdated={onUpdated} />)}
    {!charts.length && !error && <p className="obs-muted">Ask your agent to create a chart and add series data. Uploaded images appear below.</p>}
    {next !== null && <button className="obs-link-button" onClick={loadMore}>Load more interactive charts</button>}
  </section>;
}

export function PublicSeriesChartsPanel({campaignId}:{campaignId:string}) {
  const [charts,setCharts] = useState<Chart[]>([]), [next,setNext] = useState<number|null>(null), [error,setError] = useState("");
  async function load(offset=0) {try {const response=await fetch(`/api/research/series?public=1&campaign_id=${encodeURIComponent(campaignId)}&offset=${offset}`);const body=await response.json();if(!response.ok) throw new Error(body.error || "Unable to load charts.");setCharts(items=>offset ? [...items,...body.charts.filter((chart:Chart)=>!items.some(item=>item.id===chart.id))] : body.charts);setNext(body.next_offset);}catch(cause){setError(cause instanceof Error?cause.message:"Unable to load charts.");}}
  useEffect(()=>{void load();},[campaignId]);
  if (!charts.length && !error) return null;
  return <section><h2>Interactive charts</h2>{error && <p role="alert">{error}</p>}{charts.map(chart=><SeriesChart key={chart.id} chart={chart} publicView />)}{next !== null && <button type="button" className="obs-link-button" onClick={()=>void load(next)}>Load more charts</button>}</section>;
}

function SeriesChart({chart,data,onUpdated,publicView=false}:{chart:Chart;data?:Snapshot;onUpdated?:()=>void;publicView?:boolean}) {
  const [points,setPoints] = useState<Point[]>([]), [next,setNext] = useState<number|null>(null), [error,setError] = useState(""), [loading,setLoading] = useState(false);
  const [start,setStart] = useState(0), [end,setEnd] = useState<number|null>(null), [hidden,setHidden] = useState<string[]>([]), [kind,setKind] = useState(chart.chart_type);
  const [smoothing,setSmoothing] = useState(0), [scale,setScale] = useState<"linear"|"log">("linear");
  const eventVersion = data?.events.at(-1)?.id;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research/series?campaign_id=${encodeURIComponent(chart.campaign_id)}&chart_id=${chart.id}&limit=2000${publicView ? "&public=1" : ""}`,{signal:controller.signal,cache:"no-store"}).then(async response => {const body = await response.json(); if (!response.ok) throw new Error(body.error || "Unable to load chart data.");return body;}).then(body => {if (!controller.signal.aborted) {setPoints(body.points);setNext(body.next_offset);setError("");}}).catch(cause => {if (!controller.signal.aborted) setError(cause.message);});
    return () => controller.abort();
  },[chart.id,chart.campaign_id,eventVersion,publicView]);
  async function loadMore() {setLoading(true);try {const response=await fetch(`/api/research/series?campaign_id=${encodeURIComponent(chart.campaign_id)}&chart_id=${chart.id}&offset=${next}&limit=2000${publicView ? "&public=1" : ""}`);const body=await response.json();if(!response.ok) throw new Error(body.error || "Unable to load data.");setPoints(items=>[...items,...body.points.filter((point:Point)=>!items.some(item=>item.id===point.id))]);setNext(body.next_offset);}catch(cause){setError(cause instanceof Error ? cause.message : "Unable to load data.");}finally{setLoading(false);}}
  const names = useMemo(() => [...new Set(points.map(point => point.series))], [points]);
  const last = Math.max(0,points.length-1), first = Math.min(start,last), final = Math.max(first,Math.min(end ?? last,last));
  const visible = points.slice(first,final+1).filter(point => !hidden.includes(point.series));
  const plotted = names.flatMap(name => {
    let previous: number | undefined;
    return visible.filter(point => point.series === name).sort((a,b)=>a.x-b.x).map(point => {
      const displayY = kind === "line" && previous !== undefined ? smoothing*previous+(1-smoothing)*point.y : point.y;
      previous = displayY;
      return {...point,displayY};
    });
  });
  const logarithmic = scale === "log" && kind !== "bar" && plotted.every(point => point.displayY > 0);
  const transform = (value:number) => logarithmic ? Math.log10(value) : value;
  const xs = plotted.map(point=>point.x), ys = plotted.map(point=>point.displayY);
  if (kind === "bar" && ys.length) ys.push(0);
  const minX = xs.reduce((a,b)=>Math.min(a,b),Infinity), maxX = xs.reduce((a,b)=>Math.max(a,b),-Infinity), minY = ys.reduce((a,b)=>Math.min(a,b),Infinity), maxY = ys.reduce((a,b)=>Math.max(a,b),-Infinity);
  const x = (value:number) => maxX === minX ? 360 : 70+(value-minX)/(maxX-minX)*620;
  const y = (value:number) => maxY === minY ? 120 : 215-(transform(value)-transform(minY))/(transform(maxY)-transform(minY))*185;
  function download() {
    const csvCell = (value:unknown) => `"${(typeof value === "number" ? String(value) : String(value ?? "").replace(/^[\s]*[=+@\-]/,"'$&")).replaceAll('"','""')}"`;
    const rows = [["series","x","y","observed_at","run_id","note"],...visible.map(point=>[point.series,point.x,point.y,point.observed_at,point.run_id,point.note])];
    const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(csvCell).join(",")).join("\r\n")],{type:"text/csv;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="rognet-chart.csv";link.click();URL.revokeObjectURL(url);
  }
  return <article className="obs-series-card"><div className="obs-card-heading"><div><h3>{chart.title}</h3>{chart.caption && <p>{chart.caption}</p>}</div><span className="obs-subtle-label">{chart.is_public ? "Published" : "Private"}</span></div>
    {error && <p role="alert" className="obs-form-error">{error}</p>}
    {points.length > 0 ? <>
      <div className="obs-chart-controls"><label>Chart type<select value={kind} onChange={event=>setKind(event.target.value as Chart["chart_type"])}><option value="line">Line</option><option value="scatter">Points</option><option value="bar">Bars</option></select></label>
        <label>Vertical scale<select value={logarithmic ? "log" : "linear"} onChange={event=>setScale(event.target.value as "linear"|"log")}><option value="linear">Linear</option><option value="log" disabled={kind === "bar" || visible.some(point=>point.y<=0)}>Logarithmic</option></select></label>
        {kind === "line" && <label>Smoothing: {smoothing.toFixed(2)}<input type="range" min="0" max="0.9" step="0.05" value={smoothing} onChange={event=>setSmoothing(Number(event.target.value))} aria-label={`${chart.title} smoothing`} /></label>}
        <label>From {date(points[first].observed_at)}<input type="range" min={0} max={last} value={first} onChange={event=>{const value=Number(event.target.value);setStart(value);if(end!==null&&value>end)setEnd(value);}} aria-label={`${chart.title} start time`} /></label>
        <label>To {date(points[final].observed_at)}<input type="range" min={first} max={last} value={final} onChange={event=>setEnd(Number(event.target.value))} aria-label={`${chart.title} end time`} /></label></div>
      <div className="obs-series-toggles" aria-label="Show series">{names.map((name,index)=><label key={name}><input type="checkbox" checked={!hidden.includes(name)} onChange={event=>setHidden(items=>event.target.checked?items.filter(item=>item!==name):[...items,name])}/><i style={{background:colors[index%colors.length]}} />{name}</label>)}</div>
      {kind === "line" && smoothing > 0 && <p className="obs-muted">The lines use exponential smoothing. The data table and CSV retain the original values.</p>}
      {visible.length ? <div className="obs-series-plot" role="img" aria-label={`${chart.title}: ${visible.length} points. Exact values are in the data table below.`}><svg viewBox="0 0 720 270" aria-hidden="true">
        <line x1="70" y1="215" x2="690" y2="215" stroke="#667"/><line x1="70" y1="30" x2="70" y2="215" stroke="#667"/>
        <text x="3" y="32" fill="#a5b2bd">{numeric(maxY)}</text><text x="3" y="215" fill="#a5b2bd">{numeric(minY)}</text><text x="70" y="238" fill="#a5b2bd">{numeric(minX)}</text><text x="690" y="238" textAnchor="end" fill="#a5b2bd">{numeric(maxX)}</text><text x="380" y="260" textAnchor="middle" fill="#a5b2bd">{chart.x_label}</text><text x="70" y="16" fill="#a5b2bd">{chart.y_label}{chart.unit ? ` (${chart.unit})` : ""}</text>
        {kind === "line" && names.map((name,index)=><polyline key={name} points={plotted.filter(point=>point.series===name).map(point=>`${x(point.x)},${y(point.displayY)}`).join(" ")} fill="none" stroke={colors[index%colors.length]} strokeDasharray={index%2?"6 4":undefined} strokeWidth="2"/>)}
        {plotted.map(point=>kind === "bar" ? <rect key={point.id} x={x(point.x)-3} y={Math.min(y(point.displayY),y(0))} width="6" height={Math.max(1,Math.abs(y(point.displayY)-y(0)))} fill={colors[names.indexOf(point.series)%colors.length]}><title>{point.series}: {numeric(point.y)} · {date(point.observed_at)}</title></rect> : <circle key={point.id} cx={x(point.x)} cy={y(point.displayY)} r="3.5" fill={colors[names.indexOf(point.series)%colors.length]}><title>{point.series}: {numeric(point.y)}{smoothing > 0 && kind === "line" ? ` (smoothed ${numeric(point.displayY)})` : ""} · {date(point.observed_at)}{point.note ? ` · ${point.note}` : ""}</title></circle>)}
      </svg></div> : <p className="obs-muted">Choose a series to show its points.</p>}
      <button type="button" className="obs-link-button" onClick={download}>Download shown data as CSV</button>
      <details className="obs-details"><summary>Data table ({visible.length} points)</summary><div className="obs-metric-table-wrap"><table className="obs-metric-table"><thead><tr><th>Series</th><th>{chart.x_label}</th><th>{chart.y_label}{chart.unit ? ` (${chart.unit})` : ""}</th><th>Recorded</th><th>Note</th></tr></thead><tbody>{visible.map(point=><tr key={point.id}><td>{point.series}</td><td>{numeric(point.x)}</td><td>{numeric(point.y)}</td><td>{date(point.observed_at)}</td><td>{point.note}</td></tr>)}</tbody></table></div></details>
    </> : <p className="obs-muted">No points recorded yet.</p>}
    {next !== null && <p className="obs-muted">Showing {points.length} of {chart.point_count} points. <button type="button" className="obs-link-button" onClick={loadMore} disabled={loading}>{loading ? "Loading…" : "Load more points"}</button></p>}
    {!publicView && chart.is_public && <p className="obs-muted">New points stay private until this chart is published again.</p>}
    {data?.campaign.role === "owner" && onUpdated && <RemoveResearchItem campaignId={chart.campaign_id} id={chart.id} name={chart.title} kind="chart" isPublic={chart.is_public} onRemoved={onUpdated}/>}
  </article>;
}
