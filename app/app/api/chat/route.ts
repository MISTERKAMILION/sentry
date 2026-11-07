import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function POST(req: NextRequest) {
  try {
    // 1. Initialize Groq INSIDE the request (avoids env loading timing issues)
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const { messages } = await req.json();
    const userMessage = messages[messages.length - 1].content;
    const supabase = createServiceSupabaseClient();

    // 2. Get embedding from local Python service
    let contextText = "";
    let evidenceIds: string[] = [];

    try {
      const embedRes = await fetch("http://localhost:8000/embed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: userMessage }),
      });

      if (embedRes.ok) {
        const embedData = await embedRes.json();
        const queryEmbedding = JSON.stringify(embedData.embedding);

        // 3. Search Supabase for relevant legal chunks
        const { data: chunks, error: searchError } = await supabase.rpc(
          "match_legal_chunks",
          {
            query_embedding: queryEmbedding,
            match_threshold: 0.3,
            match_count: 3,
          }
        );

        if (!searchError && chunks && chunks.length > 0) {
          contextText = chunks
            .map((c: any) => `[EVIDENCE_ID: ${c.evidence_id}] (${c.heading})\n${c.chunk_text}\nSource: ${c.official_pdf_url}`)
            .join("\n\n---\n\n");
          evidenceIds = chunks.map((c: any) => c.evidence_id);
        }
      }
    } catch (e) {
      console.warn("Embedding service unavailable, falling back to direct AI.");
    }

    // 4. Build the S.E.N.T.R.Y System Prompt
    const LE_VIDENCE_HEADER = "--- LEGAL EVIDENCE ---";
    const NO_EVIDENCE_MSG = "No relevant legal documents found in the database.";
    const GENERAL_KNOWLEDGE_WARNING = "⚠️ Note: I could not find this in the verified legal database, so this is general AI guidance.";
    const DISCLAIMER = "Always include a disclaimer that this is not legal advice.";
    
    let systemPromptParts = [
      "You are S.E.N.T.R.Y, an AI Product Compliance Assistant.",
      "",
      "If the provided LEGAL EVIDENCE contains the answer to the user's question, you MUST base your answer strictly on that evidence and cite it using the [EVIDENCE_ID] format.",
      "",
      "If the LEGAL EVIDENCE is empty or does NOT contain the answer, use your general knowledge as an expert compliance assistant to answer the user's question. When doing this, you MUST start your response with: " + GENERAL_KNOWLEDGE_WARNING + " Then provide a helpful, detailed answer explaining the potential risks, safety certifications, and IP concerns.",
      "",
      DISCLAIMER
    ];
    
    const systemPrompt = systemPromptParts.join("\n");

    // 5. Stream from Groq
    const groqStream = await groq.chat.completions.create({
      model: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
      temperature: 0.1,
    });

    // 6. Return the stream
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of groqStream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) controller.enqueue(encoder.encode(content));
        }
        controller.close();
      },
    });

    return new NextResponse(readableStream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });

  } catch (error: any) {
    console.error("Chat error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
