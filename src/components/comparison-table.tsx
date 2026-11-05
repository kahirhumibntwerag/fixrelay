"use client";

import { useMemo, useState } from "react";
import "./comparison-table.css";

type Cell = string | number | null;
export type TableVersion = { id: string; version: number; columns: string[]; rows: Cell[][]; note?: string; created_at: string };
export type ComparisonTableData = {
  id: string; title: string; caption: string; columns: string[]; rows: Cell[][];
  published_at: string | null; is_public: boolean; versions?: TableVersion[];
};

function delta(current: Cell, previous: Cell) {
  const number = (value: Cell) => typeof value === "number" ? value : typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : NaN;
  const a = number(current), b = number(previous);
  return Number.isFinite(a) && Number.isFinite(b) ? `${a - b > 0 ? "+" : ""}${Number((a - b).toPrecision(5))}` : null;
}

export function ComparisonTable({ table }: { table: ComparisonTableData }) {
  const versions = table.versions?.length ? table.versions : [{ id: table.id, version: 1, columns: table.columns, rows: table.rows, created_at: "", note: "" }];
  const [selected, setSelected] = useState<number | null>(null);
  const [baseline, setBaseline] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{column: number; descending: boolean} | null>(null);
  const index = Math.min(selected ?? versions.length - 1, versions.length - 1);
  const current = versions[index], before = versions[Math.min(baseline, versions.length - 1)];
  const rows = useMemo(() => {
    const filtered = current.rows.filter(row => row.some(cell => String(cell ?? "").toLowerCase().includes(search.toLowerCase())));
    if (!sort) return filtered;
    return [...filtered].sort((a,b) => String(a[sort.column] ?? "").localeCompare(String(b[sort.column] ?? ""), undefined, {numeric: true}) * (sort.descending ? -1 : 1));
  }, [current, search, sort]);
  const canCompare = index !== baseline && new Set(current.columns).size === current.columns.length && new Set(before.columns).size === before.columns.length &&
    new Set(current.rows.map(row => String(row[0]))).size === current.rows.length && new Set(before.rows.map(row => String(row[0]))).size === before.rows.length;
  const originalRows = new Map(before.rows.map(row => [String(row[0]), row]));
  const currentRowNames = new Set(current.rows.map(row => String(row[0])));
  const removedRows = canCompare ? before.rows.filter(row => !currentRowNames.has(String(row[0]))).map(row => String(row[0])) : [];
  const removedColumns = canCompare ? before.columns.filter(column => !current.columns.includes(column)) : [];
  return <figure className="comparison-table">
    <figcaption><strong>{table.title}</strong>{table.caption && <p>{table.caption}</p>}</figcaption>
    {versions.length > 1 && <div className="comparison-timeline">
      <label>Version {current.version} · {new Date(current.created_at).toLocaleString()}
        <input aria-label={`Version of ${table.title}`} type="range" min={0} max={versions.length-1} value={index} onChange={event => setSelected(Number(event.target.value))} />
      </label>
      <label>Compare with <select value={baseline} onChange={event => setBaseline(Number(event.target.value))}>{versions.map((version, i) => <option key={version.id} value={i}>Version {version.version} · {new Date(version.created_at).toLocaleDateString()}</option>)}</select></label>
      {current.note && <p>{current.note}</p>}
      {index !== baseline && !canCompare && <p>Changes cannot be matched because row names or column names are repeated.</p>}
      {canCompare && <p>Changed cells show their earlier value. Rows are matched by the first column.</p>}
      {removedRows.length > 0 && <p>Removed rows: {removedRows.join(", ")}</p>}
      {removedColumns.length > 0 && <p>Removed columns: {removedColumns.join(", ")}</p>}
    </div>}
    <label className="comparison-search">Filter rows <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this table" /></label>
    <div className="comparison-table-scroll" role="region" aria-label={`${table.title} comparison table`} tabIndex={0}>
      <table>
        <thead><tr>{current.columns.map((column, col) => <th scope="col" key={col}><button type="button" className="comparison-sort" onClick={() => setSort(sort?.column === col ? {column: col, descending: !sort.descending} : {column: col, descending: false})}>{column}{sort?.column === col ? (sort.descending ? " ↓" : " ↑") : ""}</button>{canCompare && !before.columns.includes(column) && <small className="comparison-change">new column</small>}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, col) => {
          const oldRow = originalRows.get(String(row[0]));
          const oldCol = before.columns.indexOf(current.columns[col]);
          const old = oldRow && oldCol >= 0 ? oldRow[oldCol] : undefined;
          const changed = canCompare && col > 0 && old !== undefined && ((old === null) !== (cell === null) || String(old) !== String(cell));
          const content = <>{cell ?? "—"}{canCompare && col === 0 && !oldRow && <small className="comparison-change">new row</small>}{changed && <small className="comparison-change"> was {old ?? "—"}{delta(cell, old!) !== null ? ` (${delta(cell, old!)})` : ""}</small>}</>;
          return col === 0 ? <th scope="row" key={col}>{content}</th> : <td className={changed ? "comparison-changed" : undefined} key={col}>{content}</td>;
        })}</tr>)}</tbody>
      </table>
      {!rows.length && <p>No matching rows.</p>}
    </div>
  </figure>;
}
