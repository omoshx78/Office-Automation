import { useState, useEffect } from "react";
import { colors, fonts, buttonPrimary, buttonSecondary, card, input as inputStyle } from "../theme.js";

export default function AdminPanel({ backendUrl, token }) {
  const [users, setUsers] = useState([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("member");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState("");

  const authHeaders = { Authorization: `Bearer ${token}` };

  async function loadUsers() {
    const res = await fetch(`${backendUrl}/api/admin/users`, { headers: authHeaders });
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function createUser(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ username: newUsername, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create user");
      setNewUsername("");
      setNewPassword("");
      setNewRole("member");
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteUser(id) {
    if (!confirm("Remove this user? This can't be undone.")) return;
    const res = await fetch(`${backendUrl}/api/admin/users/${id}`, {
      method: "DELETE",
      headers: authHeaders,
    });
    if (res.ok) await loadUsers();
    else {
      const data = await res.json();
      setError(data.error);
    }
  }

  async function submitResetPassword(e) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`${backendUrl}/api/admin/users/${resetTarget.id}/reset-password`, {
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
        Organization users
      </h3>
      <p style={{ fontSize: 13, color: colors.slateMuted, marginTop: 0 }}>
        Give teammates their username and password directly — there's no email step.
        You can reset a forgotten password here at any time.
      </p>

      <form onSubmit={createUser} style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 12, color: colors.navy, fontWeight: 600 }}>Username</label>
          <br />
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: colors.navy, fontWeight: 600 }}>Initial password</label>
          <br />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: colors.navy, fontWeight: 600 }}>Role</label>
          <br />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} style={{ ...inputStyle, padding: "9px 10px" }}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading} style={buttonPrimary}>
          {loading ? "Adding..." : "Add user"}
        </button>
      </form>

      {error && <p style={{ color: colors.danger, fontSize: 13 }}>{error}</p>}

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: `2px solid ${colors.navy}` }}>
            <th style={{ padding: 8, color: colors.navy }}>Username</th>
            <th style={{ padding: 8, color: colors.navy }}>Role</th>
            <th style={{ padding: 8, color: colors.navy }}>Joined</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ padding: 8 }}>{u.username}</td>
              <td style={{ padding: 8 }}>{u.role}</td>
              <td style={{ padding: 8 }}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={{ padding: 8 }}>
                <button onClick={() => setResetTarget(u)} style={{ ...buttonSecondary, padding: "5px 12px", fontSize: 12, marginRight: 8 }}>
                  Reset password
                </button>
                <button onClick={() => deleteUser(u.id)} style={{ ...buttonSecondary, padding: "5px 12px", fontSize: 12, color: colors.danger, borderColor: colors.danger }}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

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
