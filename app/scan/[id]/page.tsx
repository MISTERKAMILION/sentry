"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { CheckStatusList } from "@/components/scan/check-status-list";
import { ReportView } from "@/components/report/report-view";

function ScanPageContent() {
  const params = useParams();
  const scanId = params.id as string;
  const [scan, setScan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchScan = async () => {
    try {
      const token = localStorage.getItem("supabase_access_token");
      const response = await fetch(`/api/scans/${scanId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.status === 404 || response.status === 403) {
        setError("Scan not found or access denied");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        setError("Failed to load scan");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setScan(data);
      setLoading(false);
    } catch (err) {
      setError("Network error");
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScan();
    const interval = setInterval(() => {
      if (scan?.status === "queued" || scan?.status === "running") {
        fetchScan();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [scanId, scan?.status]);

  if (loading) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: "2rem", textAlign: "center", color: "#ef4444" }}>{error}</div>;
  }

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "1.8rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
          Scan Progress
        </h1>
        <p style={{ color: "#6b7280" }}>Scan ID: {scanId}</p>
      </header>

      <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem" }}>Overall Status</h2>
        <p><strong>Status:</strong> {scan?.status}</p>
        {scan?.product_name && <p><strong>Product:</strong> {scan.product_name}</p>}
        {scan?.target_country && <p><strong>Target Country:</strong> {scan.target_country}</p>}
      </div>

      <CheckStatusList scanId={scanId} checks={scan?.checks || []} />

      {scan?.report && <ReportView report={scan.report} />}
    </main>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>}>
      <ScanPageContent />
    </Suspense>
  );
}
