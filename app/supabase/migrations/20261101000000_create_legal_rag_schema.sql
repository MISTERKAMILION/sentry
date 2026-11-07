-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- legal_sources
CREATE TABLE IF NOT EXISTS legal_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  authority_level TEXT NOT NULL,
  language TEXT,
  last_checked_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true
);

-- legal_documents
CREATE TABLE IF NOT EXISTS legal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES legal_sources(id),
  country_code TEXT NOT NULL,
  category TEXT,
  document_number TEXT,
  title TEXT NOT NULL,
  language TEXT,
  legal_text_clean TEXT,
  official_pdf_url TEXT,
  official_html_url TEXT,
  publication_date DATE,
  effective_date DATE,
  repeal_date DATE,
  legal_status TEXT DEFAULT 'unknown',
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  edition TEXT
);

-- legal_document_versions
CREATE TABLE IF NOT EXISTS legal_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES legal_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  amendment_reference TEXT,
  retrieved_at TIMESTAMPTZ DEFAULT now(),
  verification_status TEXT DEFAULT 'unverified',
  UNIQUE(document_id, version_number)
);

-- legal_chunks with vector(384)
CREATE TABLE IF NOT EXISTS legal_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id UUID REFERENCES legal_document_versions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  section_reference TEXT,
  heading TEXT,
  chunk_text TEXT NOT NULL,
  embedding vector(384),
  token_count INTEGER,
  content_hash TEXT,
  language TEXT,
  evidence_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ingestion_jobs
CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES legal_sources(id),
  status TEXT DEFAULT 'pending',
  requested_by UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  documents_discovered INTEGER DEFAULT 0,
  documents_processed INTEGER DEFAULT 0,
  documents_failed INTEGER DEFAULT 0,
  last_error TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_legal_chunks_embedding ON legal_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_legal_documents_country ON legal_documents(country_code);
CREATE INDEX IF NOT EXISTS idx_legal_chunks_doc_version ON legal_chunks(document_version_id);

-- RLS
ALTER TABLE legal_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingestion_jobs ENABLE ROW LEVEL SECURITY;
