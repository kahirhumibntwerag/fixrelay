"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export default function Snippets({ origin }: { origin: string }) {
  const [active, setActive] = useState("Claude Code");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const url = `${origin}/mcp`;
  const snippets: Record<string, string> = {
    "Claude Code": `claude mcp add --transport http rognet ${url}`,
    Codex: `codex mcp add rognet --url ${url}`,
    "MCP JSON": JSON.stringify(
      { mcpServers: { rognet: { type: "http", url } } },
      null,
      2,
    ),
  };
  return (
    <div className="snippet-box">
      <div className="snippet-tabs" role="group" aria-label="Choose your agent">
        {Object.keys(snippets).map((name) => (
          <button
            className={active === name ? "selected" : ""}
            aria-pressed={active === name}
            onClick={() => {
              setActive(name);
              setCopyState("idle");
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
          aria-label={`Copy ${active} configuration`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(snippets[active]);
              setCopyState("copied");
            } catch {
              setCopyState("error");
            }
          }}
        >
          {copyState === "copied" ? (
            <Check size={17} aria-hidden="true" />
          ) : (
            <Copy size={17} aria-hidden="true" />
          )}
          <span>{copyState === "copied" ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <p>
        {active === "MCP JSON"
          ? "Add this to your client’s MCP configuration file."
          : "Run this in your terminal, then restart your agent session."}
      </p>
      <p className="copy-feedback" role="status" aria-live="polite">
        {copyState === "copied"
          ? "Configuration copied to clipboard."
          : copyState === "error"
            ? "Could not copy. Select the configuration above and copy it manually."
            : ""}
      </p>
    </div>
  );
}
