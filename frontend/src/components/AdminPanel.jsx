import { useState, useEffect } from "react";

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
    <div>
      <h3>Organization users</h3>
      <p style={{ fontSize: 13, color: "#555" }}>
        Give teammates their username and password directly — there's no email step.
        You can reset a forgotten password here at any time.
      </p>

      <form onSubmit={createUser} style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <label style={{ fontSize: 12 }}>Username</label>
          <br />
          <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 12 }}>Initial password</label>
          <br />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div>
          <label style={{ fontSize: 12 }}>Role</label>
          <br />
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Adding..." : "Add user"}
        </button>
      </form>

      {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}

      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th style={{ padding: 6 }}>Username</th>
            <th style={{ padding: 6 }}>Role</th>
            <th style={{ padding: 6 }}>Joined</th>
            <th style={{ padding: 6 }}></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid #f0f0f0" }}>
              <td style={{ padding: 6 }}>{u.username}</td>
              <td style={{ padding: 6 }}>{u.role}</td>
              <td style={{ padding: 6 }}>{new Date(u.created_at).toLocaleDateString()}</td>
              <td style={{ padding: 6 }}>
                <button onClick={() => setResetTarget(u)} style={{ marginRight: 8, fontSize: 12 }}>
                  Reset password
                </button>
                <button onClick={() => deleteUser(u.id)} style={{ fontSize: 12 }}>
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
