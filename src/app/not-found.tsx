import Link from "next/link";
export default function NotFound() {
  return (
    <div className="content empty">
      <h1>Solution not found.</h1>
      <p>This report may not exist or the link may be incomplete.</p>
      <Link className="button primary" href="/">
        Explore solutions
      </Link>
    </div>
  );
}
