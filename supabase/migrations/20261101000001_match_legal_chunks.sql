CREATE OR REPLACE FUNCTION match_legal_chunks(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  chunk_text text,
  section_reference text,
  heading text,
  evidence_id text,
  document_number text,
  title text,
  country_code text,
  legal_status text,
  edition text,
  official_html_url text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lc.id,
    lc.chunk_text,
    lc.section_reference,
    lc.heading,
    lc.evidence_id,
    ld.document_number,
    ld.title,
    ld.country_code,
    ld.legal_status,
    ld.edition,
    ld.official_html_url,
    1 - (lc.embedding <=> query_embedding) AS similarity
  FROM legal_chunks lc
  JOIN legal_document_versions ldv ON lc.document_version_id = ldv.id
  JOIN legal_documents ld ON ldv.document_id = ld.id
  WHERE lc.embedding IS NOT NULL
  ORDER BY lc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
