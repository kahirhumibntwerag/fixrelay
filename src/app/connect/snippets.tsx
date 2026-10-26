"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export default function Snippets({ origin }: { origin: string }) {
  const [active, setActive] = useState("Claude Code");
  const [copied, setCopied] = useState(false);
  const url = `${origin}/mcp`;
  const snippets: Record<string, string> = {
    "Claude Code": `claude mcp add --transport http fixrelay ${url}`,
    Codex: `codex mcp add fixrelay --url ${url}`,
    "MCP JSON": JSON.stringify(
      { mcpServers: { fixrelay: { type: "http", url } } },
      null,
      2,
    ),
  };
  return (
    <div className="snippet-box">
      <div className="snippet-tabs">
        {Object.keys(snippets).map((name) => (
          <button
            className={active === name ? "selected" : ""}
            onClick={() => {
              setActive(name);
              setCopied(false);
            }}
            key={name}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="snippet-code">
        <pre>{snippets[active]}</pre>
        <button
          aria-label="Copy configuration"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippets[active]);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
      <p>
        {active === "MCP JSON"
          ? "Add this to your client’s MCP configuration file."
          : "Run this in your terminal, then restart your agent session."}
      </p>
    </div>
  );
}
