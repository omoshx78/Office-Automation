import { useState } from "react";

export default function DiffView({ backendUrl, token, uploadedFiles }) {
  const [pathA, setPathA] = useState("");
  const [pathB, setPathB] = useState("");
  const [sheetA, setSheetA] = useState("");
  const [sheetB, setSheetB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function runCompare() {
    if (!pathA || !pathB) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/compare-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filePathA: pathA,
          sheetNameA: sheetA || undefined,
          filePathB: pathB,
          sheetNameB: sheetB || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Comparison failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const diffSet = new Set((result?.diffs || []).map((d) => `${d.row}-${d.col}`));

  function renderGrid(sheet, label) {
    if (!sheet) return null;
    const maxCols = sheet.reduce((m, row) => Math.max(m, row.length), 0);
    return (
      <div style={{ overflowX: "auto", flex: 1 }}>
        <h4>{label}</h4>
        <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <tbody>
            {sheet.map((row, rIdx) => (
              <tr key={rIdx}>
                {Array.from({ length: maxCols }).map((_, cIdx) => {
                  const isDiff = diffSet.has(`${rIdx + 1}-${cIdx + 1}`);
                  const value = row[cIdx];
                  return (
                    <td
                      key={cIdx}
                      style={{
                        border: "1px solid #ddd",
                        padding: "4px 8px",
                        background: isDiff ? "#ffe9a8" : "transparent",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {value === null || value === undefined ? "" : String(value)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <h3>Compare Excel sheets</h3>

      <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
        <div>
          <label>File A</label>
          <br />
          <select value={pathA} onChange={(e) => setPathA(e.target.value)}>
            <option value="">Select file...</option>
            {uploadedFiles.map((f) => (
              <option key={f.path} value={f.path}>
                {f.originalName}
              </option>
            ))}
          </select>
          <br />
          {result?.availableSheetsA && (
            <select value={sheetA} onChange={(e) => setSheetA(e.target.value)}>
              {result.availableSheetsA.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label>File B</label>
          <br />
          <select value={pathB} onChange={(e) => setPathB(e.target.value)}>
            <option value="">Select file...</option>
            {uploadedFiles.map((f) => (
              <option key={f.path} value={f.path}>
                {f.originalName}
              </option>
            ))}
          </select>
          <br />
          {result?.availableSheetsB && (
            <select value={sheetB} onChange={(e) => setSheetB(e.target.value)}>
              {result.availableSheetsB.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <button onClick={runCompare} disabled={loading || !pathA || !pathB}>
        {loading ? "Comparing..." : "Compare"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <>
          <p style={{ marginTop: 12 }}>
            <strong>{result.diffs.length}</strong> differing cell
            {result.diffs.length === 1 ? "" : "s"} between{" "}
            <em>{result.sheetNameA}</em> and <em>{result.sheetNameB}</em>. Highlighted cells
            below differ (shown at the same row/column position in each sheet).
          </p>
          <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
            {renderGrid(result.sheetA, `A: ${result.sheetNameA}`)}
            {renderGrid(result.sheetB, `B: ${result.sheetNameB}`)}
          </div>
        </>
      )}
    </div>
  );
}
