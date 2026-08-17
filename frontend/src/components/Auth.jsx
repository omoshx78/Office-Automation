import { useState } from "react";
import SkylineArt from "./SkylineArt.jsx";
import { colors, fonts, buttonPrimary, input as inputStyle } from "../theme.js";

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
    <div style={{ minHeight: "100vh", display: "flex", flexWrap: "wrap" }}>
      {/* Hero side */}
      <div
        style={{
          position: "relative",
          flex: "1 1 480px",
          minHeight: 320,
          overflow: "hidden",
          display: "flex",
          alignItems: "flex-end",
        }}
      >
        <SkylineArt style={{ position: "absolute", inset: 0 }} />
        <div style={{ position: "relative", padding: "48px 48px 56px", color: colors.white, maxWidth: 480 }}>
          <div
            style={{
              fontFamily: fonts.body,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: colors.sky,
              marginBottom: 12,
            }}
          >
            Office Automation
          </div>
          <h1
            style={{
              fontFamily: fonts.display,
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 600,
              lineHeight: 1.15,
              margin: "0 0 16px",
            }}
          >
            Run your office.
            <br />
            Skip the busywork.
          </h1>
          <p style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 1.6, color: "#D7EAF7", margin: 0 }}>
            Compare spreadsheets, generate reports, draft documents, and build
            presentations — all from one place, for your whole team.
          </p>
        </div>
      </div>

      {/* Form side */}
      <div
        style={{
          flex: "1 1 380px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 32,
          background: colors.skyPale,
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 380,
            background: colors.white,
            border: `1px solid ${colors.border}`,
            borderRadius: 16,
            boxShadow: "0 8px 30px rgba(10, 46, 77, 0.10)",
            padding: 36,
          }}
        >
          <h2
            style={{
              fontFamily: fonts.display,
              fontSize: 26,
              fontWeight: 600,
              color: colors.navy,
              margin: "0 0 8px",
            }}
          >
            {mode === "login" ? "Welcome back" : "Create your organization"}
          </h2>
          {mode === "create-org" && (
            <p style={{ fontFamily: fonts.body, fontSize: 13, color: colors.slateMuted, marginTop: 0 }}>
              This creates a new organization and makes you its admin. You can then add
              teammates from the Admin panel — there's no separate public signup.
            </p>
          )}

          <form onSubmit={submit} style={{ marginTop: 20 }}>
            {mode === "create-org" && (
              <Field label="Organization name">
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  style={inputStyle}
                />
              </Field>
            )}
            <Field label="Username">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="letters, numbers, _ . - only"
                style={inputStyle}
              />
            </Field>
            <Field label={mode === "create-org" ? "Password (min 8 characters)" : "Password"}>
              <input
                type="password"
                required
                minLength={mode === "create-org" ? 8 : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={inputStyle}
              />
            </Field>

            {error && (
              <p style={{ fontFamily: fonts.body, color: colors.danger, fontSize: 13, marginTop: -4 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{ ...buttonPrimary, width: "100%", padding: "12px 20px", marginTop: 8, opacity: loading ? 0.7 : 1 }}
            >
              {loading ? "Please wait..." : mode === "login" ? "Log in" : "Create organization"}
            </button>
          </form>

          <p style={{ fontFamily: fonts.body, fontSize: 13, marginTop: 20, color: colors.slateMuted }}>
            {mode === "login" ? (
              <>
                Starting fresh?{" "}
                <LinkButton
                  onClick={() => {
                    setMode("create-org");
                    setError(null);
                  }}
                >
                  Create a new organization
                </LinkButton>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <LinkButton
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                >
                  Log in
                </LinkButton>
              </>
            )}
          </p>
          <p style={{ fontFamily: fonts.body, fontSize: 12, color: "#93A3B3", marginTop: 4 }}>
            If your admin created your account for you, log in directly with the
            username and password they gave you.
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label
        style={{
          display: "block",
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          fontWeight: 600,
          color: colors.navy,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function LinkButton({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: colors.skyDark,
        fontWeight: 600,
        cursor: "pointer",
        padding: 0,
        fontSize: 13,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {children}
    </button>
  );
}
