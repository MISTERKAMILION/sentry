import { NextRequest, NextResponse } from "next/server";
import { createRequestSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authorization = req.headers.get("authorization");
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length).trim()
      : "";

    if (!authorization || !accessToken) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const supabase = createRequestSupabaseClient(authorization);
    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const body = await req.json();
    const { query } = body;

    if (!query) {
      return NextResponse.json({ error: "Query required" }, { status: 400 });
    }

    // Call Python embedding service
    const embedServiceUrl = process.env.EMBEDDING_SERVICE_URL || "http://localhost:8000/embed";
    try {
      const resp = await fetch(embedServiceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: query }),
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) {
        throw new Error("Embedding service failed");
      }
      const data = await resp.json();
      const embedding = data.embedding;
      if (!Array.isArray(embedding) || embedding.length !== 384) {
        throw new Error("Invalid embedding dimension");
      }
      return NextResponse.json({ embedding, model: "sentence-transformers/all-MiniLM-L6-v2" });
    } catch (error: any) {
      return NextResponse.json({ 
        error: "Retrieval unavailable: embedding generation failed", 
        details: error.message 
      }, { status: 503 });
    }
  } catch (error) {
    console.error("Embeddings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
