import { useState } from "react";

export default function BatchTemplateFlow({ backendUrl, token }) {
  const [templateFile, setTemplateFile] = useState(null);
  const [dataFile, setDataFile] = useState(null);
  const [templatePath, setTemplatePath] = useState("");
  const [dataPath, setDataPath] = useState("");
  const [filenameField, setFilenameField] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function uploadOne(file, setPath) {
    const formData = new FormData();
    formData.append("files", file);
    const res = await fetch(`${backendUrl}/api/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const data = await res.json();
    setPath(data.files[0].path);
  }

  async function runBatch() {
    if (!templatePath || !dataPath) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${backendUrl}/api/batch-generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          templatePath,
          dataFilePath: dataPath,
          filenameField: filenameField || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Batch generation failed");
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function downloadZip() {
    const res = await fetch(`${backendUrl}${result.zipUrl}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Could not download the zip file");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "batch-documents.zip";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <h3>Batch generate documents/emails from a template</h3>
      <p style={{ fontSize: 13, color: "#555" }}>
        Upload a Word template with placeholders like <code>{"{name}"}</code>,{" "}
        <code>{"{amount}"}</code>, etc., and an Excel file whose first row headers match those
        placeholders. One document is produced per data row.
      </p>

      <div style={{ marginBottom: 12 }}>
        <label>Word template (.docx)</label>
        <br />
        <input
          type="file"
          accept=".docx"
          onChange={(e) => {
            const f = e.target.files[0];
            setTemplateFile(f);
            if (f) uploadOne(f, setTemplatePath);
          }}
        />
        {templatePath && <span style={{ marginLeft: 8, fontSize: 12 }}>uploaded</span>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Data source (.xlsx, first row = headers)</label>
        <br />
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const f = e.target.files[0];
            setDataFile(f);
            if (f) uploadOne(f, setDataPath);
          }}
        />
        {dataPath && <span style={{ marginLeft: 8, fontSize: 12 }}>uploaded</span>}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Column to use for output filenames (optional, e.g. "client_name")</label>
        <br />
        <input
          type="text"
          value={filenameField}
          onChange={(e) => setFilenameField(e.target.value)}
          placeholder="defaults to document-1, document-2, ..."
        />
      </div>

      <button onClick={runBatch} disabled={loading || !templatePath || !dataPath}>
        {loading ? "Generating..." : "Generate batch"}
      </button>

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 12 }}>
          <p>
            Generated <strong>{result.count}</strong> document{result.count === 1 ? "" : "s"}.
          </p>
          <ul>
            {result.files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <button onClick={downloadZip}>Download all as .zip</button>
        </div>
      )}
    </div>
  );
}
