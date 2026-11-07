"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import Link from "next/link";

interface Scan {
  id: string;
  product_name: string;
  status: string;
  target_country: string;
  marketplace: string;
  created_at: string;
}

export default function MyScansPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadScans = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      try {
        let token = localStorage.getItem("supabase_access_token") || session.access_token;
        if (token) localStorage.setItem("supabase_access_token", token);

        const response = await fetch("/api/me/scans", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Failed to load scans");
          setLoading(false);
          return;
        }

        const data = await response.json();
        setScans(data.scans || []);
      } catch (err) {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };

    loadScans();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("supabase_access_token");
    router.push("/login");
  };

  return (
    <main style={{ minHeight: "100vh", background: "#0a0a0a" }}>
      <header style={{ padding: "1rem 2rem", borderBottom: "1px solid #1f2937", background: "#111111", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#a855f7", cursor: "pointer" }} onClick={() => router.push("/")}>S.E.N.T.R.Y</h1>
          <nav style={{ display: "flex", gap: "1.5rem" }}>
            <Link href="/" style={{ color: "#e5e7eb" }}>New Scan</Link>
            <Link href="/my-scans" style={{ color: "#a855f7", fontWeight: "500" }}>My Scans</Link>
          </nav>
        </div>
        <button onClick={handleSignOut} style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer" }}>Sign Out</button>
      </header>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem" }}>
        <h2 style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#e5e7eb", marginBottom: "1.5rem" }}>My Scans</h2>

        {loading && <p style={{ color: "#9ca3af" }}>Loading...</p>}
        {error && <p style={{ color: "#ef4444" }}>{error}</p>}

        {!loading && !error && scans.length === 0 && (
          <div style={{ textAlign: "center", padding: "3rem", background: "#111111", borderRadius: "12px", border: "1px solid #1f2937" }}>
            <p style={{ color: "#9ca3af", marginBottom: "1rem" }}>No scans yet</p>
            <button onClick={() => router.push("/")} style={{ padding: "0.75rem 1.5rem", borderRadius: "8px", background: "linear-gradient(135deg, #a855f7 0%, #9333ea 100%)", color: "white", border: "none", fontWeight: "500" }}>
              Start Your First Scan
            </button>
          </div>
        )}

        {!loading && scans.length > 0 && (
          <div style={{ background: "#111111", borderRadius: "12px", border: "1px solid #1f2937", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#0a0a0a" }}>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#9ca3af", fontSize: "0.875rem", fontWeight: "500" }}>Product</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#9ca3af", fontSize: "0.875rem", fontWeight: "500" }}>Country</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#9ca3af", fontSize: "0.875rem", fontWeight: "500" }}>Status</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#9ca3af", fontSize: "0.875rem", fontWeight: "500" }}>Date</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "left", color: "#9ca3af", fontSize: "0.875rem", fontWeight: "500" }}></th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id} style={{ borderTop: "1px solid #1f2937" }}>
                    <td style={{ padding: "0.75rem 1rem", color: "#e5e7eb" }}>{scan.product_name}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "#9ca3af" }}>{scan.target_country}</td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <span style={{
                        padding: "0.25rem 0.75rem",
                        borderRadius: "12px",
                        fontSize: "0.75rem",
                        background: scan.status === "completed" ? "#065f46" : scan.status === "running" ? "#92400e" : "#374151",
                        color: scan.status === "completed" ? "#10b981" : scan.status === "running" ? "#f59e0b" : "#9ca3af"
                      }}>
                        {scan.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "#9ca3af", fontSize: "0.875rem" }}>
                      {new Date(scan.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: "0.75rem 1rem" }}>
                      <button onClick={() => router.push(`/scan/${scan.id}`)} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer" }}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export const dynamic = 'force-dynamic';
