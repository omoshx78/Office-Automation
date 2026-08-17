import { useState, useEffect } from "react";
import Auth from "./components/Auth.jsx";
import DiffView from "./components/DiffView.jsx";
import BatchTemplateFlow from "./components/BatchTemplateFlow.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import SuperadminPanel from "./components/SuperadminPanel.jsx";
import { colors, fonts, buttonPrimary, buttonSecondary, card } from "./theme.js";

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

  const tabs =
    user?.role === "superadmin"
      ? [["platform", "Platform"]]
      : [
          ["command", "Command"],
          ["diff", "Compare Excel"],
          ["batch", "Batch templates"],
          ...(user?.role === "admin" ? [["admin", "Admin"]] : []),
        ];

  return (
    <div style={{ minHeight: "100vh", background: colors.skyPale, fontFamily: fonts.body }}>
      {/* Top bar */}
      <div
        style={{
          background: `linear-gradient(120deg, ${colors.navy}, ${colors.skyDark})`,
          color: colors.white,
          padding: "18px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ fontFamily: fonts.display, fontSize: 22, fontWeight: 600 }}>
          Office Automation
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
          <span style={{ color: "#D7EAF7" }}>
            {user?.username} <span style={{ opacity: 0.7 }}>({user?.role})</span>
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: colors.white,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Log out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 28, borderBottom: `1px solid ${colors.border}` }}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                padding: "10px 18px",
                border: "none",
                borderBottom: tab === key ? `2px solid ${colors.sky}` : "2px solid transparent",
                background: "transparent",
                color: tab === key ? colors.navy : colors.slateMuted,
                fontWeight: tab === key ? 700 : 500,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "diff" && <DiffView backendUrl={BACKEND_URL} token={token} />}
        {tab === "batch" && <BatchTemplateFlow backendUrl={BACKEND_URL} token={token} />}
        {tab === "admin" && user?.role === "admin" && <AdminPanel backendUrl={BACKEND_URL} token={token} />}
        {tab === "platform" && user?.role === "superadmin" && (
          <SuperadminPanel backendUrl={BACKEND_URL} token={token} />
        )}

        {tab === "command" && (
          <>
            <section style={{ ...card, padding: 24, marginBottom: 20 }}>
              <SectionTitle>1. Upload files</SectionTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files))} />
                <button onClick={handleUpload} style={buttonSecondary}>
                  Upload
                </button>
              </div>
              {uploaded.length > 0 && (
                <ul style={{ marginTop: 12, paddingLeft: 20, fontSize: 14, color: colors.slateMuted }}>
                  {uploaded.map((f) => (
                    <li key={f.path}>{f.originalName}</li>
                  ))}
                </ul>
              )}
            </section>

            <section style={{ ...card, padding: 24, marginBottom: 20 }}>
              <SectionTitle>2. Give a command</SectionTitle>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder='e.g. "Compare Sheet1 in file A with Sheet1 in file B", "Merge these two PDFs and add page numbers", or "Build a 5-slide PowerPoint from this Excel data with a blue theme and a bar chart"'
                rows={3}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  fontFamily: fonts.body,
                  fontSize: 14,
                  resize: "vertical",
                }}
              />
              <button
                onClick={handleRunCommand}
                disabled={loading}
                style={{ ...buttonPrimary, marginTop: 12, opacity: loading ? 0.7 : 1 }}
              >
                {loading ? "Working..." : "Run"}
              </button>
            </section>

            <section style={{ ...card, padding: 24 }}>
              <SectionTitle>Log</SectionTitle>
              {log.length === 0 && (
                <p style={{ color: colors.slateMuted, fontSize: 14 }}>Nothing yet — run a command above.</p>
              )}
              {log.map((entry, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: entry.role === "user" ? colors.skyDark : colors.navy,
                      marginBottom: 2,
                    }}
                  >
                    {entry.role}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{entry.text}</div>
                  {entry.role === "assistant" && /draft/i.test(entry.text) && (
                    <div
                      style={{
                        marginTop: 8,
                        padding: "10px 14px",
                        background: "#FDF6E8",
                        border: `1px solid ${colors.gold}`,
                        borderRadius: 8,
                        fontSize: 13,
                        color: "#6B5320",
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
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3
      style={{
        fontFamily: fonts.display,
        fontSize: 18,
        fontWeight: 600,
        color: colors.navy,
        margin: "0 0 16px",
      }}
    >
      {children}
    </h3>
  );
}
