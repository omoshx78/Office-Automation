import { useState } from "react";

export default function Auth({ backendUrl, onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "create-org"
  const [orgName, setOrgName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const url =
        mode === "login" ? `${backendUrl}/api/auth/login` : `${backendUrl}/api/auth/register-organization`;
      const body = mode === "login" ? { username, password } : { orgName, username, password };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      onAuthenticated(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 380, margin: "80px auto", fontFamily: "sans-serif" }}>
      <h2>{mode === "login" ? "Log in" : "Create your organization"}</h2>
      {mode === "create-org" && (
        <p style={{ fontSize: 13, color: "#555" }}>
          This creates a new organization and makes you its admin. You can then add
          teammates from the Admin panel — there's no separate public signup.
        </p>
      )}

      <form onSubmit={submit}>
        {mode === "create-org" && (
          <div style={{ marginBottom: 12 }}>
            <label>Organization name</label>
            <br />
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              style={{ width: "100%", padding: 6 }}
            />
          </div>
        )}
        <div style={{ marginBottom: 12 }}>
          <label>Username</label>
          <br />
          <input
            type="text"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="letters, numbers, _ . - only"
            style={{ width: "100%", padding: 6 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label>Password {mode === "create-org" && "(min 8 characters)"}</label>
          <br />
          <input
            type="password"
            required
            minLength={mode === "create-org" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: "100%", padding: 6 }}
          />
        </div>
        {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={loading} style={{ width: "100%", padding: 8 }}>
          {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create organization"}
        </button>
      </form>

      <p style={{ fontSize: 13, marginTop: 16 }}>
        {mode === "login" ? (
          <>
            Starting fresh?{" "}
            <button
              onClick={() => {
                setMode("create-org");
                setError(null);
              }}
              style={{ background: "none", border: "none", color: "#0066cc", cursor: "pointer", padding: 0 }}
            >
              Create a new organization
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              onClick={() => {
                setMode("login");
                setError(null);
              }}
              style={{ background: "none", border: "none", color: "#0066cc", cursor: "pointer", padding: 0 }}
            >
              Log in
            </button>
          </>
        )}
      </p>
      <p style={{ fontSize: 12, color: "#888", marginTop: 8 }}>
        If your admin created your account for you, use the username and password they
        gave you and log in directly — no need to create a new organization.
      </p>
    </div>
  );
}
