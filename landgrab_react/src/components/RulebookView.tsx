import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rulebookContentImport from "../content/PlayerRuleBook.md?raw";

interface RulebookViewProps {
  onClose: () => void;
}

export function RulebookView({ onClose }: RulebookViewProps) {
  const [content, setContent] = useState<string>(() => {
    const raw = typeof rulebookContentImport === "string" ? rulebookContentImport : "";
    return raw.trim() || "";
  });

  useEffect(() => {
    if (content) return;
    fetch("/PlayerRuleBook.md")
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.statusText))))
      .then((text) => setContent(text.trim()))
      .catch(() => setContent("*Rulebook could not be loaded.*"));
  }, [content]);

  return (
    <div className="rulebook-overlay" role="dialog" aria-label="Player Rulebook">
      <div className="rulebook-backdrop" onClick={onClose} aria-hidden />
      <div className="rulebook-panel">
        <div className="rulebook-header">
          <h2>Player Rulebook</h2>
          <button type="button" className="rulebook-close" onClick={onClose} aria-label="Close rulebook">
            ✕
          </button>
        </div>
        <div className="rulebook-content">
          {content ? (
            <div className="rulebook-markdown">
              <ReactMarkdown
                components={{
                  table: ({ children }) => <div className="rulebook-table-wrap"><table>{children}</table></div>,
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <p className="rulebook-loading">Loading rulebook…</p>
          )}
        </div>
      </div>
    </div>
  );
}
