import "./comparison-table.css";

export type ComparisonTableData = {
  id: string;
  title: string;
  caption: string;
  columns: string[];
  rows: (string | number | null)[][];
  published_at: string | null;
  is_public: boolean;
};

export function ComparisonTable({ table }: { table: ComparisonTableData }) {
  return <figure className="comparison-table">
    <figcaption><strong>{table.title}</strong>{table.caption && <p>{table.caption}</p>}</figcaption>
    <div className="comparison-table-scroll" role="region" aria-label={`${table.title} comparison table`} tabIndex={0}>
      <table>
        <thead><tr>{table.columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0
          ? <th scope="row" key={cellIndex}>{cell ?? "—"}</th>
          : <td key={cellIndex}>{cell ?? "—"}</td>)}</tr>)}</tbody>
      </table>
    </div>
  </figure>;
}
