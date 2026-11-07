"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [googleError, setGoogleError] = useState("");

  useEffect(() => {
    // Check for OAuth error in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error) {
      setGoogleError(error);
    }
  }, []);

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setGoogleError(error.message);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        setMessage("Check your email for the verification link!");
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data.session?.access_token) {
          localStorage.setItem("supabase_access_token", data.session.access_token);
          router.push("/");
        }
      }
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a", padding: "1rem" }}>
      <div style={{ width: "100%", maxWidth: "400px", background: "#111111", padding: "2rem", borderRadius: "12px", border: "1px solid #1f2937" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#a855f7", marginBottom: "0.5rem" }}>S.E.N.T.R.Y</h1>
          <p style={{ color: "#9ca3af" }}>{isSignUp ? "Create your account" : "Sign in to your account"}</p>
        </div>

        {/* Google Sign-In Button */}
        <div style={{ marginBottom: "1.5rem" }}>
          <button
            onClick={handleGoogleSignIn}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "8px",
              background: "#ffffff",
              border: "1px solid #ddd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              fontWeight: "500",
              cursor: "pointer",
            }}>
              Continue with Google
            </button>
        </div>

        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", color: "#e5e7eb", fontSize: "0.875rem" }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "#1a1a1a", color: "#e5e7eb", border: "1px solid #374151" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", color: "#e5e7eb", fontSize: "0.875rem" }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ width: "100%", padding: "0.75rem", borderRadius: "8px", background: "#1a1a1a", color: "#e5e7eb", border: "1px solid #374151" }}
            />
          </div>

          {googleError && (
            <p style={{ color: "#ef4444", fontSize: "0.875rem", marginBottom: "1rem", textAlign: "center" }}>
              {googleError}
            </p>
          )}

          {message && (
            <p style={{ color: message.includes("Check your email") ? "#10b981" : "#ef4444", fontSize: "0.875rem" }}>{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "8px",
              background: loading ? "#374151" : "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)",
              color: "white",
              border: "none",
              fontWeight: "500",
            }}
          >
            {loading ? "Loading..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer" }}
          >
            {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
          </button>
        </div>
      </div>
    </main>
  );
}