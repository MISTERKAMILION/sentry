"use client";

interface Check {
  check_type: string;
  status: string;
}

interface CheckStatusListProps {
  scanId: string;
  checks: Check[];
}

const checkNames: Record<string, string> = {
  legal: "Legal Compliance",
  ip: "Intellectual Property",
  safety: "Product Safety",
  recalls: "Recalls & Alerts",
};

const statusColors: Record<string, string> = {
  queued: "#6b7280",
  running: "#3b82f6",
  completed: "#10b981",
  partial: "#f59e0b",
  unavailable: "#6b7280",
  failed: "#ef4444",
};

export function CheckStatusList({ scanId, checks }: CheckStatusListProps) {
  const checkTypes = ["legal", "ip", "safety", "recalls"];
  
  return (
    <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", marginBottom: "1.5rem", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem" }}>Compliance Checks (4)</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {checkTypes.map((type) => {
          const check = checks.find((c) => c.check_type === type);
          const status = check?.status || "queued";
          return (
            <div key={type} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "#f9fafb", borderRadius: "4px" }}>
              <span style={{ fontWeight: "500" }}>{checkNames[type]}</span>
              <span style={{ 
                padding: "0.25rem 0.75rem", 
                borderRadius: "9999px", 
                background: statusColors[status] + "20",
                color: statusColors[status],
                fontSize: "0.875rem",
                fontWeight: "500"
              }}>
                {status}
              </span>
            </div>
          );
        })}
      </div>
      <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
        Execution progress: {checks.filter(c => ["completed", "partial", "unavailable", "failed"].includes(c.status)).length} / 4
      </p>
    </div>
  );
}
