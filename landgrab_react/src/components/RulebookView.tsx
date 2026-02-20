import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

interface RulebookViewProps {
  onClose: () => void;
}

const RULEBOOK_URL = "/PlayerRuleBook.md";

export function RulebookView({ onClose }: RulebookViewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(RULEBOOK_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load rulebook: ${res.status}`);
        return res.text();
      })
      .then(setContent)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rulebook"));
  }, []);

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
          {error && <p className="rulebook-error">{error}</p>}
          {content === null && !error && <p className="rulebook-loading">Loading…</p>}
          {content && (
            <ReactMarkdown
              className="rulebook-markdown"
              components={{
                table: ({ children }) => <div className="rulebook-table-wrap"><table>{children}</table></div>,
              }}
            >
              {content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}
