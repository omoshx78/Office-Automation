import { useState, useEffect } from "react";

export default function SuperadminPanel({ backendUrl, token }) {
  const [orgs, setOrgs] = useState([]);
  const [error, setError] = useState(null);
  const [resetTarget, setResetTarget] = useState(null); // { id, username }
  const [resetPassword, setResetPassword] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function loadOrgs() {
    setError(null);
    const res = await fetch(`${backendUrl}/api/superadmin/organizations`, { headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setOrgs(data.organizations);
    } else {
      const data = await res.json();
      setError(data.error);
    }
  }

  useEffect(() => {
    loadOrgs();
  }, []);

  async function submitResetPassword(e) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${backendUrl}/api/superadmin/users/${resetTarget.id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ newPassword: resetPassword }),
    });
    if (res.ok) {
      setResetTarget(null);
      setResetPassword("");
    } else {
      const data = await res.json();
      setError(data.error);
    }
  }

  return (
    <div>
      <h3>Platform admin</h3>
      <p style={{ fontSize: 13, color: "#555" }}>
        Break-glass access only — you can see organization/admin names and reset a
        password, but nothing about what's inside any organization's files or data.
      </p>

      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}

      {orgs.map((org) => (
        <div key={org.id} style={{ marginBottom: 20, border: "1px solid #eee", borderRadius: 4, padding: 12 }}>
          <strong>{org.name}</strong>{" "}
          <span style={{ fontSize: 12, color: "#888" }}>
            created {new Date(org.createdAt).toLocaleDateString()}
          </span>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginTop: 8 }}>
            <tbody>
              {org.users.map((u) => (
                <tr key={u.id} style={{ borderBottom: "1px solid #f5f5f5" }}>
                  <td style={{ padding: 4 }}>{u.username}</td>
                  <td style={{ padding: 4 }}>{u.role}</td>
                  <td style={{ padding: 4 }}>
                    <button onClick={() => setResetTarget(u)} style={{ fontSize: 12 }}>
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {resetTarget && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 4,
            maxWidth: 320,
          }}
        >
          <form onSubmit={submitResetPassword}>
            <p style={{ margin: "0 0 8px" }}>
              Reset password for <strong>{resetTarget.username}</strong>
            </p>
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={8}
              required
              style={{ width: "100%", padding: 6, marginBottom: 8 }}
            />
            <button type="submit">Set new password</button>
            <button
              type="button"
              onClick={() => {
                setResetTarget(null);
                setResetPassword("");
              }}
              style={{ marginLeft: 8 }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
