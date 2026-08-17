import { useState } from "react";
import { colors, fonts, buttonPrimary, buttonSecondary, card } from "../theme.js";

export default function DiffView({ backendUrl, token }) {
  const [fileA, setFileA] = useState(null); // { originalName, path }
  const [fileB, setFileB] = useState(null);
  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);
  const [sheetA, setSheetA] = useState("");
  const [sheetB, setSheetB] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function uploadFile(file, setFileState, setUploadingState) {
    setUploadingState(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch(`${backendUrl}/api/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setFileState(data.files[0]);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingState(false);
    }
  }

  async function runCompare() {
    if (!fileA || !fileB) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/compare-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          filePathA: fileA.path,
          sheetNameA: sheetA || undefined,
          filePathB: fileB.path,
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
        <h4 style={{ color: colors.navy, fontSize: 14 }}>{label}</h4>
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
                        border: `1px solid ${colors.border}`,
                        padding: "4px 8px",
                        background: isDiff ? "#FCE9C2" : "transparent",
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

  function FileSlot({ label, file, uploading, onFileSelected, sheetValue, setSheetValue, availableSheets }) {
    return (
      <div style={{ flex: 1, minWidth: 220 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: colors.navy }}>{label}</label>
        <br />
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files[0];
            if (f) onFileSelected(f);
          }}
          style={{ marginTop: 6, fontSize: 13 }}
        />
        {uploading && <div style={{ fontSize: 12, color: colors.slateMuted, marginTop: 4 }}>Uploading...</div>}
        {file && !uploading && (
          <div style={{ fontSize: 12, color: colors.slateMuted, marginTop: 4 }}>✓ {file.originalName}</div>
        )}
        {availableSheets && (
          <select
            value={sheetValue}
            onChange={(e) => setSheetValue(e.target.value)}
            style={{ marginTop: 8, padding: "6px 8px", borderRadius: 6, border: `1px solid ${colors.border}` }}
          >
            {availableSheets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...card, padding: 24 }}>
      <h3 style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.navy, margin: "0 0 6px" }}>
        Compare Excel sheets
      </h3>
      <p style={{ fontSize: 13, color: colors.slateMuted, marginTop: 0, marginBottom: 16 }}>
        Upload two Excel files directly here — this tab doesn't need anything uploaded elsewhere first.
      </p>

      <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <FileSlot
          label="File A"
          file={fileA}
          uploading={uploadingA}
          onFileSelected={(f) => uploadFile(f, setFileA, setUploadingA)}
          sheetValue={sheetA}
          setSheetValue={setSheetA}
          availableSheets={result?.availableSheetsA}
        />
        <FileSlot
          label="File B"
          file={fileB}
          uploading={uploadingB}
          onFileSelected={(f) => uploadFile(f, setFileB, setUploadingB)}
          sheetValue={sheetB}
          setSheetValue={setSheetB}
          availableSheets={result?.availableSheetsB}
        />
      </div>

      <button
        onClick={runCompare}
        disabled={loading || !fileA || !fileB}
        style={{ ...buttonPrimary, opacity: loading || !fileA || !fileB ? 0.6 : 1 }}
      >
        {loading ? "Comparing..." : "Compare"}
      </button>

      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}

      {result && (
        <>
          <p style={{ marginTop: 16, fontSize: 14 }}>
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
