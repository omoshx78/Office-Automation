import { useState, useEffect } from "react";
import Auth from "./components/Auth.jsx";
import DiffView from "./components/DiffView.jsx";
import BatchTemplateFlow from "./components/BatchTemplateFlow.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import SuperadminPanel from "./components/SuperadminPanel.jsx";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [tab, setTab] = useState("command");
  const [files, setFiles] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [command, setCommand] = useState("");
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(false);

  // On load, if a token is already stored, verify it's still valid
  // before trusting it (e.g. it may have expired).
  useEffect(() => {
    if (!token) {
      setCheckingSession(false);
      return;
    }
    fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        setUser(data.user);
        if (data.user.role === "superadmin") setTab("platform");
      })
      .catch(() => {
        localStorage.removeItem("token");
        setToken(null);
      })
      .finally(() => setCheckingSession(false));
  }, [token]);

  function handleAuthenticated(newToken, newUser) {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
    setUploaded([]);
    setLog([]);
  }

  function authHeaders(extra = {}) {
    return { Authorization: `Bearer ${token}`, ...extra };
  }

  async function handleUpload() {
    if (files.length === 0) return;
    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));

    const res = await fetch(`${BACKEND_URL}/api/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: formData,
    });
    const data = await res.json();
    setUploaded(data.files);
    setLog((l) => [...l, { role: "system", text: `Uploaded ${data.files.length} file(s).` }]);
  }

  async function handleRunCommand() {
    if (!command.trim()) return;
    setLoading(true);
    setLog((l) => [...l, { role: "user", text: command }]);

    const res = await fetch(`${BACKEND_URL}/api/command`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        command,
        context: { filePaths: uploaded.map((f) => f.path) },
      }),
    });
    const data = await res.json();
    setLog((l) => [...l, { role: "assistant", text: data.text || data.error }]);
    setCommand("");
    setLoading(false);
  }

  if (checkingSession) return null;

  if (!token) {
    return <Auth backendUrl={BACKEND_URL} onAuthenticated={handleAuthenticated} />;
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Office Automation</h1>
        <div style={{ fontSize: 13, color: "#555" }}>
          {user?.username} ({user?.role}){" "}
          <button onClick={handleLogout} style={{ marginLeft: 8 }}>
            Log out
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, borderBottom: "1px solid #ddd" }}>
        {[
          ...(user?.role === "superadmin"
            ? [["platform", "Platform"]]
            : [
                ["command", "Command"],
                ["diff", "Compare Excel"],
                ["batch", "Batch templates"],
                ...(user?.role === "admin" ? [["admin", "Admin"]] : []),
              ]),
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "8px 16px",
              border: "none",
              borderBottom: tab === key ? "2px solid #333" : "2px solid transparent",
              background: "transparent",
              fontWeight: tab === key ? "bold" : "normal",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "diff" && <DiffView backendUrl={BACKEND_URL} token={token} uploadedFiles={uploaded} />}
      {tab === "batch" && <BatchTemplateFlow backendUrl={BACKEND_URL} token={token} />}
      {tab === "admin" && user?.role === "admin" && <AdminPanel backendUrl={BACKEND_URL} token={token} />}
      {tab === "platform" && user?.role === "superadmin" && (
        <SuperadminPanel backendUrl={BACKEND_URL} token={token} />
      )}

      {tab === "command" && (
        <>
          <section style={{ marginBottom: 24 }}>
            <h3>1. Upload files</h3>
            <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
            <button onClick={handleUpload} style={{ marginLeft: 8 }}>
              Upload
            </button>
            <ul>
              {uploaded.map((f) => (
                <li key={f.path}>{f.originalName}</li>
              ))}
            </ul>
          </section>

          <section>
            <h3>2. Give a command</h3>
            <textarea
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='e.g. "Compare Sheet1 in file A with Sheet1 in file B and list the differences", "Fill the Word template with rows from the Excel file", or "Merge these two PDFs and add page numbers"'
              rows={3}
              style={{ width: "100%" }}
            />
            <button onClick={handleRunCommand} disabled={loading} style={{ marginTop: 8 }}>
              {loading ? "Working..." : "Run"}
            </button>
          </section>

          <section style={{ marginTop: 32 }}>
            <h3>Log</h3>
            {log.map((entry, i) => (
              <div key={i} style={{ marginBottom: 12 }}>
                <strong>{entry.role}:</strong>
                <div style={{ whiteSpace: "pre-wrap" }}>{entry.text}</div>
                {entry.role === "assistant" && /draft/i.test(entry.text) && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "8px 12px",
                      background: "#fff3cd",
                      border: "1px solid #ffe08a",
                      borderRadius: 4,
                      fontSize: 13,
                    }}
                  >
                    This looks like it produced an email draft. Nothing is ever sent
                    automatically — open the .eml file, review it, and send it yourself
                    from your email client.
                  </div>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
