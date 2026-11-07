"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function ProductScanForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    product_name: "",
    amazon_url: "",
    marketplace: "amazon.com",
    target_country: "US",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "validating" | "submitting" | "submitted" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.product_name.trim() && !formData.amazon_url.trim()) {
      newErrors.general = "Provide product_name or amazon_url.";
    }
    if (formData.amazon_url.trim() && !formData.amazon_url.match(/^https?:\/\/.+/)) {
      newErrors.amazon_url = "Invalid URL format";
    }
    if (!formData.target_country.trim() || formData.target_country.length !== 2) {
      newErrors.target_country = "Target country must be a 2-letter code";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("validating");
    if (!validate()) {
      setStatus("idle");
      return;
    }

    setStatus("submitting");
    const key = idempotencyKey || generateIdempotencyKey();
    setIdempotencyKey(key);

    try {
      const body: any = {
        marketplace: formData.marketplace,
        target_country: formData.target_country.toUpperCase(),
        monitor_weekly: false,
      };
      if (formData.product_name.trim()) {
        body.product_name = formData.product_name.trim();
      }
      if (formData.amazon_url.trim()) {
        body.amazon_url = formData.amazon_url.trim();
      }

      // Get auth token from localStorage or prompt
      const token = localStorage.getItem("supabase_access_token") || prompt("Enter access token:");
      if (token) localStorage.setItem("supabase_access_token", token);

      const response = await fetch("/api/scans", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 409) {
        setErrorMessage("Idempotency key was already used with a different request.");
        setStatus("error");
        return;
      }

      if (!response.ok) {
        const data = await response.json();
        setErrorMessage(data.error || "Scan could not be created.");
        setStatus("error");
        return;
      }

      const data = await response.json();
      setStatus("submitted");
      router.push(`/scan/${data.scan_id}`);
    } catch (err) {
      setErrorMessage("Network error occurred");
      setStatus("error");
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: "white", padding: "2rem", borderRadius: "8px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="product_name" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          Product Name
        </label>
        <input
          id="product_name"
          type="text"
          value={formData.product_name}
          onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
          style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "4px" }}
          disabled={status === "submitting"}
        />
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="amazon_url" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          Amazon Product URL
        </label>
        <input
          id="amazon_url"
          type="url"
          value={formData.amazon_url}
          onChange={(e) => setFormData({ ...formData, amazon_url: e.target.value })}
          placeholder="https://www.amazon.com/..."
          style={{ width: "100%", padding: "0.5rem", border: errors.amazon_url ? "1px solid #ef4444" : "1px solid #d1d5db", borderRadius: "4px" }}
          disabled={status === "submitting"}
        />
        {errors.amazon_url && <p style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem" }}>{errors.amazon_url}</p>}
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="target_country" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          Target Country *
        </label>
        <input
          id="target_country"
          type="text"
          value={formData.target_country}
          onChange={(e) => setFormData({ ...formData, target_country: e.target.value.toUpperCase() })}
          maxLength={2}
          style={{ width: "100px", padding: "0.5rem", border: errors.target_country ? "1px solid #ef4444" : "1px solid #d1d5db", borderRadius: "4px" }}
          disabled={status === "submitting"}
        />
        {errors.target_country && <p style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem" }}>{errors.target_country}</p>}
      </div>

      <div style={{ marginBottom: "1.5rem" }}>
        <label htmlFor="marketplace" style={{ display: "block", marginBottom: "0.5rem", fontWeight: "500" }}>
          Marketplace
        </label>
        <select
          id="marketplace"
          value={formData.marketplace}
          onChange={(e) => setFormData({ ...formData, marketplace: e.target.value })}
          style={{ width: "100%", padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "4px" }}
          disabled={status === "submitting"}
        >
          <option value="amazon.com">amazon.com</option>
          <option value="amazon.co.uk">amazon.co.uk</option>
          <option value="amazon.de">amazon.de</option>
        </select>
      </div>

      {errors.general && <p style={{ color: "#ef4444", marginBottom: "1rem" }}>{errors.general}</p>}
      {errorMessage && <p style={{ color: "#ef4444", marginBottom: "1rem" }}>{errorMessage}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        style={{
          width: "100%",
          padding: "0.75rem",
          background: status === "submitting" ? "#9ca3af" : "#3b82f6",
          color: "white",
          border: "none",
          borderRadius: "4px",
          fontSize: "1rem",
          fontWeight: "500",
        }}
      >
        {status === "submitting" ? "Submitting..." : "Scan Product"}
      </button>
    </form>
  );
}
