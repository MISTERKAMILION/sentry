"use client";

interface ReportViewProps {
  report: any;
}

export function ReportView({ report }: ReportViewProps) {
  if (!report) return null;

  return (
    <div style={{ background: "white", padding: "1.5rem", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <h2 style={{ fontSize: "1.2rem", fontWeight: "600", marginBottom: "1rem" }}>Compliance Report</h2>
      
      {report.scoring_status === "scored" && report.compliance_risk_score !== null && report.compliance_risk_score !== undefined && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#fef3c7", borderRadius: "4px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Compliance Risk Score</h3>
          <p style={{ fontSize: "2rem", fontWeight: "bold" }}>{report.compliance_risk_score}/100</p>
          <p style={{ fontSize: "0.875rem", color: "#92400e", marginTop: "0.5rem" }}>
            Higher values indicate higher compliance risk. A lower score reflects the evidence assessed under this report's methodology. It is not a guarantee of legal compliance, product safety, or marketplace approval.
          </p>
        </div>
      )}

      {report.scoring_status === "incomplete" && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#fee2e2", borderRadius: "4px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "0.5rem", color: "#991b1b" }}>Assessment incomplete — risk score unavailable</h3>
          <p style={{ fontSize: "0.875rem", color: "#991b1b" }}>
            One or more required checks could not establish sufficient evidence. This report does not establish that the product is low risk or compliant. Review the missing research and obtain manual verification before relying on this assessment.
          </p>
        </div>
      )}

      {report.scoring_status === "failed" && (
        <div style={{ marginBottom: "1.5rem", padding: "1rem", background: "#fee2e2", borderRadius: "4px" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "0.5rem", color: "#991b1b" }}>Risk assessment failed</h3>
          <p style={{ fontSize: "0.875rem", color: "#991b1b" }}>
            An assessment could not be completed. No valid compliance risk score is available.
          </p>
        </div>
      )}

      {report.findings && report.findings.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontWeight: "600", marginBottom: "0.75rem" }}>Findings</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {report.findings.map((finding: any, idx: number) => (
              <div key={idx} style={{ padding: "0.75rem", background: "#f9fafb", borderRadius: "4px" }}>
                <h4 style={{ fontWeight: "500", marginBottom: "0.25rem" }}>{finding.title}</h4>
                <p style={{ fontSize: "0.875rem", color: "#374151" }}>{finding.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.summary && (
        <div>
          <h3 style={{ fontWeight: "600", marginBottom: "0.5rem" }}>Summary</h3>
          <p style={{ color: "#374151" }}>{report.summary}</p>
        </div>
      )}
    </div>
  );
}
