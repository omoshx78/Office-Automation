import { useState, useEffect } from "react";
import { colors, fonts, buttonPrimary, buttonSecondary, card, input as inputStyle } from "../theme.js";

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
    <div style={{ ...card, padding: 24 }}>
      <h3 style={{ fontFamily: fonts.display, fontSize: 18, fontWeight: 600, color: colors.navy, margin: "0 0 6px" }}>
        Platform admin
      </h3>
      <p style={{ fontSize: 13, color: colors.slateMuted, marginTop: 0 }}>
        Break-glass access only — you can see organization/admin names and reset a
        password, but nothing about what's inside any organization's files or data.
      </p>

      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      {orgs.map((org) => (
        <div key={org.id} style={{ marginBottom: 20, border: `1px solid ${colors.border}`, borderRadius: 10, padding: 16 }}>
          <strong style={{ color: colors.navy }}>{org.name}</strong>{" "}
          <span style={{ fontSize: 12, color: colors.slateMuted }}>
            created {new Date(org.createdAt).toLocaleDateString()}
          </span>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13, marginTop: 10 }}>
            <tbody>
              {org.users.map((u) => (
                <tr key={u.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ padding: 6 }}>{u.username}</td>
                  <td style={{ padding: 6 }}>{u.role}</td>
                  <td style={{ padding: 6 }}>
                    <button onClick={() => setResetTarget(u)} style={{ ...buttonSecondary, padding: "5px 12px", fontSize: 12 }}>
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
            padding: 16,
            border: `1px solid ${colors.border}`,
            borderRadius: 10,
            maxWidth: 320,
            background: colors.skyPale,
          }}
        >
          <form onSubmit={submitResetPassword}>
            <p style={{ margin: "0 0 8px", fontSize: 14 }}>
              Reset password for <strong>{resetTarget.username}</strong>
            </p>
            <input
              type="password"
              placeholder="New password (min 8 characters)"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              minLength={8}
              required
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <button type="submit" style={buttonPrimary}>Set new password</button>
            <button
              type="button"
              onClick={() => {
                setResetTarget(null);
                setResetPassword("");
              }}
              style={{ ...buttonSecondary, marginLeft: 8 }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
