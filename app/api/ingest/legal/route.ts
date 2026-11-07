import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  try {
    const supabase = createServiceSupabaseClient();
    const body = await req.json();
    
    const { document, chunks } = body;

    if (!document || !chunks || !Array.isArray(chunks)) {
      return NextResponse.json({ error: "Invalid payload structure" }, { status: 400 });
    }

    let sourceId;
    const { data: existingSource } = await supabase
      .from("legal_sources")
      .select("id")
      .eq("source_name", "GovInfo")
      .eq("country_code", "US")
      .single();

    if (existingSource) {
      sourceId = existingSource.id;
    } else {
      const { data: newSource, error: sourceError } = await supabase
        .from("legal_sources")
        .insert({
          country_code: "US",
          source_name: "GovInfo",
          source_url: "https://www.govinfo.gov/",
          source_type: "API",
          authority_level: "Official",
          language: "en",
          active: true
        })
        .select("id")
        .single();
      
      if (sourceError) throw new Error(`Source insert failed: ${sourceError.message}`);
      sourceId = newSource.id;
    }

    const { data: docData, error: docError } = await supabase
      .from("legal_documents")
      .insert({
        source_id: sourceId,
        country_code: "US",
        category: document.category || "Product Safety",
        document_number: document.document_number || "15 U.S.C. § 2063",
        title: document.title || "Product Certification",
        language: "en",
        legal_text_clean: document.legal_text_clean || "",
        official_pdf_url: document.official_pdf_url || "",
        official_html_url: document.official_html_url || "",
        legal_status: "Current",
        publication_date: document.publication_date || null
      })
      .select("id")
      .single();

    if (docError) throw new Error(`Document insert failed: ${docError.message}`);

    const { data: versionData, error: versionError } = await supabase
      .from("legal_document_versions")
      .insert({
        document_id: docData.id,
        version_number: 1,
        content_hash: "hash-poc-v1", 
        retrieved_at: new Date().toISOString(),
        verification_status: "unverified"
      })
      .select("id")
      .single();

    if (versionError) throw new Error(`Version insert failed: ${versionError.message}`);

    const formattedChunks = chunks.map((chunk: any, index: number) => ({
      document_version_id: versionData.id,
      chunk_index: index,
      section_reference: chunk.section_reference || "§ 2063",
      heading: chunk.heading || "Product Certification and Labeling",
      chunk_text: chunk.text,
      embedding: JSON.stringify(chunk.embedding),
      token_count: chunk.token_count || 100,
      language: "en",
      evidence_id: `EVID-${Date.now()}-${index}`,
      content_hash: chunk.content_hash || "hash-poc-v1"
    }));

    const { error: chunkError } = await supabase
      .from("legal_chunks")
      .insert(formattedChunks);

    if (chunkError) throw new Error(`Chunk insert failed: ${chunkError.message}`);

    return NextResponse.json({ 
      success: true, 
      message: "Ingested successfully",
      document_id: docData.id, 
      chunks_inserted: chunks.length 
    });

  } catch (error: any) {
    console.error("Ingest error:", error.message);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
