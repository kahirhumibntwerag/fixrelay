import Link from "next/link";
export default function NotFound() {
  return (
    <div className="content empty">
      <h1>Record not found.</h1>
      <p>
        This record may be private or missing. Use your private workspace token
        when needed.
      </p>
      <Link className="button primary" href="/">
        Explore experiments
      </Link>
    </div>
  );
}
