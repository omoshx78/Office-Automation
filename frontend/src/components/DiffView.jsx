import { useState, useEffect } from "react";
import { colors, fonts, buttonPrimary, buttonSecondary, card } from "../theme.js";

export default function DiffView({ backendUrl, token }) {
  const [fileA, setFileA] = useState(null); // { originalName, path }
  const [fileB, setFileB] = useState(null);
  const [uploadingA, setUploadingA] = useState(false);
  const [uploadingB, setUploadingB] = useState(false);
  const [sheetsInfoA, setSheetsInfoA] = useState(null); // { availableSheets, headersBySheet }
  const [sheetsInfoB, setSheetsInfoB] = useState(null);
  const [sheetNameA, setSheetNameA] = useState("");
  const [sheetNameB, setSheetNameB] = useState("");
  const [keyColumn, setKeyColumn] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function uploadFile(file, setFileState, setUploadingState, setSheetsInfo) {
    setUploadingState(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("files", file);
      const res = await fetch(`${backendUrl}/api/upload`, {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setFileState(data.files[0]);

      // Fetch sheet names + headers so the key-column dropdown can be
      // populated before running the full comparison.
      const info = await fetch(`${backendUrl}/api/excel-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ filePath: data.files[0].path }),
      });
      const infoData = await info.json();
      if (info.ok) setSheetsInfo(infoData);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingState(false);
    }
  }

  useEffect(() => {
    if (sheetsInfoA && !sheetNameA) setSheetNameA(sheetsInfoA.availableSheets[0]);
  }, [sheetsInfoA]);
  useEffect(() => {
    if (sheetsInfoB && !sheetNameB) setSheetNameB(sheetsInfoB.availableSheets[0]);
  }, [sheetsInfoB]);

  // Suggest a key column: headers present in both selected sheets.
  const sharedHeaders =
    sheetsInfoA && sheetsInfoB && sheetNameA && sheetNameB
      ? (sheetsInfoA.headersBySheet[sheetNameA] || []).filter((h) =>
          (sheetsInfoB.headersBySheet[sheetNameB] || []).includes(h)
        )
      : [];

  useEffect(() => {
    if (sharedHeaders.length > 0 && !keyColumn) setKeyColumn(sharedHeaders[0]);
  }, [sharedHeaders.join("|")]);

  async function runReconciliation() {
    if (!fileA || !fileB || !keyColumn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${backendUrl}/api/reconcile-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          filePathA: fileA.path,
          sheetNameA,
          filePathB: fileB.path,
          sheetNameB,
          keyColumn,
          labelA: fileA.originalName,
          labelB: fileB.originalName,
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

  async function downloadReport() {
    const res = await fetch(`${backendUrl}${result.reportUrl}`, { headers: authHeaders });
    if (!res.ok) {
      setError("Could not download the report");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciliation-report.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function FileSlot({ label, file, uploading, onFileSelected, sheetsInfo, sheetName, setSheetName }) {
    return (
      <div style={{ flex: 1, minWidth: 240 }}>
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
        {sheetsInfo && (
          <select
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            style={{ marginTop: 8, padding: "6px 8px", borderRadius: 6, border: `1px solid ${colors.border}`, width: "100%" }}
          >
            {sheetsInfo.availableSheets.map((s) => (
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
        Matches rows by a key column (like VLOOKUP — works even if rows are reordered) and
        compares fields by header name (like HLOOKUP — works even if columns move). Produces a
        real downloadable report, not just a colored grid.
      </p>

      <div style={{ display: "flex", gap: 24, marginBottom: 16, flexWrap: "wrap" }}>
        <FileSlot
          label="File A"
          file={fileA}
          uploading={uploadingA}
          onFileSelected={(f) => uploadFile(f, setFileA, setUploadingA, setSheetsInfoA)}
          sheetsInfo={sheetsInfoA}
          sheetName={sheetNameA}
          setSheetName={setSheetNameA}
        />
        <FileSlot
          label="File B"
          file={fileB}
          uploading={uploadingB}
          onFileSelected={(f) => uploadFile(f, setFileB, setUploadingB, setSheetsInfoB)}
          sheetsInfo={sheetsInfoB}
          sheetName={sheetNameB}
          setSheetName={setSheetNameB}
        />
      </div>

      {sheetsInfoA && sheetsInfoB && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: colors.navy }}>
            Key column (used to match rows between the two files)
          </label>
          <br />
          {sharedHeaders.length === 0 ? (
            <p style={{ fontSize: 13, color: colors.danger, marginTop: 6 }}>
              These sheets don't share a common header name — a key column needs to exist in
              both files (e.g. "ID", "SKU", "Email").
            </p>
          ) : (
            <select
              value={keyColumn}
              onChange={(e) => setKeyColumn(e.target.value)}
              style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, border: `1px solid ${colors.border}` }}
            >
              {sharedHeaders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <button
        onClick={runReconciliation}
        disabled={loading || !fileA || !fileB || !keyColumn}
        style={{ ...buttonPrimary, opacity: loading || !fileA || !fileB || !keyColumn ? 0.6 : 1 }}
      >
        {loading ? "Comparing..." : "Compare & generate report"}
      </button>

      {error && <p style={{ color: colors.danger, marginTop: 12 }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
            <Stat label="Matched, no differences" value={result.matchedCount} />
            <Stat label="Only in File A" value={result.onlyInACount} />
            <Stat label="Only in File B" value={result.onlyInBCount} />
            <Stat label="Field differences" value={result.differenceCount} accent />
          </div>

          <button onClick={downloadReport} style={buttonSecondary}>
            Download full report (.xlsx)
          </button>

          {result.differencesPreview.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.navy, marginBottom: 8 }}>
                Preview (first {result.differencesPreview.length} of {result.differenceCount})
              </div>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: `2px solid ${colors.navy}` }}>
                    <th style={{ padding: 6 }}>{result.keyColumn}</th>
                    <th style={{ padding: 6 }}>Field</th>
                    <th style={{ padding: 6 }}>Value A</th>
                    <th style={{ padding: 6 }}>Value B</th>
                  </tr>
                </thead>
                <tbody>
                  {result.differencesPreview.map((d, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: 6 }}>{d.key}</td>
                      <td style={{ padding: 6 }}>{d.field}</td>
                      <td style={{ padding: 6, background: "#FCE9C2" }}>{String(d.valueA)}</td>
                      <td style={{ padding: 6, background: "#FCE9C2" }}>{String(d.valueB)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderRadius: 8,
        background: accent ? "#FDF6E8" : colors.skyPale,
        border: `1px solid ${accent ? colors.gold : colors.border}`,
        minWidth: 120,
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: colors.navy }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.slateMuted }}>{label}</div>
    </div>
  );
}
