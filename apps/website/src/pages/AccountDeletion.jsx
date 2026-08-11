import { WebsiteLayout } from "../components/WebsiteLayout";
import { useState } from "react";

export function AccountDeletion() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("customer");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState("form"); // form → verify → submitted

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("Service temporarily unavailable.");
      }

      // Send a magic link to verify ownership — the user must click
      // the link and sign in before deletion can proceed.
      // This prevents anonymous attackers from deleting another user's account.
      const response = await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.msg || "Could not send verification email. Please try again.");
      }

      setStep("verify");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <WebsiteLayout>
      <section className="section">
        <div className="container" style={{ maxWidth: "640px" }}>
          <header className="page-header">
            <h1 className="page-title">Delete Your Account</h1>
            <p className="page-intro">
              Request permanent deletion of your TORC account and personal data.
            </p>
          </header>

          {step === "verify" ? (
            <div style={{ marginTop: "2rem", padding: "2rem", backgroundColor: "#eff6ff", borderRadius: "12px", border: "1px solid #bfdbfe" }}>
              <h2 style={{ color: "#1e40af", marginTop: 0 }}>Check Your Email</h2>
              <p style={{ color: "#1d4ed8" }}>
                We sent a verification link to <strong>{email}</strong>.
              </p>
              <p style={{ color: "#1d4ed8" }}>
                Click the link in the email to sign in and confirm your identity. Once signed in, go to <strong>Account Security</strong> in the app to complete the deletion request.
              </p>
              <p style={{ color: "#6b7280", fontSize: "0.875rem", marginTop: "1.5rem" }}>
                If you don't receive the email within a few minutes, check your spam folder or contact{" "}
                <a href="mailto:support@torcapp.com" style={{ color: "#008CE5" }}>support@torcapp.com</a>.
              </p>
            </div>
          ) : (
            <div style={{ marginTop: "2rem" }}>
              <div style={{ padding: "1.5rem", backgroundColor: "#fef3c7", borderRadius: "12px", border: "1px solid #fcd34d", marginBottom: "2rem" }}>
                <h3 style={{ color: "#92400e", marginTop: 0, fontSize: "1rem" }}>Before you proceed</h3>
                <ul style={{ color: "#78350f", paddingLeft: "1.25rem", marginBottom: 0 }}>
                  <li>Account deletion is permanent and cannot be undone.</li>
                  <li>Your personal information will be removed from our systems.</li>
                  <li>Active jobs or pending payments must be resolved before deletion.</li>
                  <li>Certain financial and legal records may be retained as required by law, with personal identifiers removed.</li>
                  <li>You can also delete your account directly from the TORC app under Account Security.</li>
                </ul>
              </div>

              {error && (
                <div style={{ padding: "1rem", backgroundColor: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca", marginBottom: "1rem", color: "#dc2626" }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                    Email address associated with your account
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    style={{
                      width: "100%", padding: "0.75rem 1rem", borderRadius: "8px",
                      border: "1px solid #d1d5db", fontSize: "1rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontWeight: 600, marginBottom: "0.5rem", color: "#374151" }}>
                    Reason for deletion <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Optional: let us know why you're leaving"
                    rows={3}
                    style={{
                      width: "100%", padding: "0.75rem 1rem", borderRadius: "8px",
                      border: "1px solid #d1d5db", fontSize: "1rem", resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    width: "100%", padding: "0.875rem", borderRadius: "8px",
                    backgroundColor: "#dc2626", color: "#fff", fontWeight: 700,
                    fontSize: "1rem", border: "none", cursor: loading ? "wait" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {loading ? "Submitting..." : "Submit Deletion Request"}
                </button>
              </form>

              <div style={{ marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid #e5e7eb" }}>
                <h3 style={{ color: "#374151", fontSize: "1rem" }}>What happens after you submit</h3>
                <ol style={{ color: "#6b7280", paddingLeft: "1.25rem" }}>
                  <li>Our team verifies your identity using the email address provided.</li>
                  <li>We check for any active jobs, pending payments, or unresolved obligations.</li>
                  <li>Once verified, your personal data is permanently removed and financial records are anonymized.</li>
                  <li>You receive a confirmation email when deletion is complete.</li>
                </ol>
                <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>
                  For more information, see our{" "}
                  <a href="/privacy" style={{ color: "#008CE5" }}>Privacy Policy</a>.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </WebsiteLayout>
  );
}
