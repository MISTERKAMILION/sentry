#!/usr/bin/env python3
import os
import json
import hashlib
import requests
from bs4 import BeautifulSoup
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv(dotenv_path="../../.env.local")
load_dotenv(dotenv_path="../../.env.test")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_REVISION = None  # Use default
EMBEDDING_DIM = 384

def get_model():
    model = SentenceTransformer(MODEL_NAME)
    print(f"Loaded model: {MODEL_NAME}, dim: {model.get_sentence_embedding_dimension()}")
    return model

def fetch_govinfo_granule(api_key):
    if not api_key or api_key == "YOUR_GOVINFO_API_KEY" or api_key == "":
        raise ValueError("GOVINFO_API_KEY is missing")
    url = f"https://api.govinfo.gov/packages/USCODE-2024-title15/granules/USCODE-2024-title15-chap47-sec2063/htm?api_key={api_key}"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.text

def parse_html(html):
    soup = BeautifulSoup(html, 'lxml')
    # Extract text
    text = soup.get_text(separator='\n', strip=True)
    return text

def chunk_text(text):
    # Simple chunking - preserve structure
    chunks = []
    # Split by sections/articles roughly
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip()]
    current_chunk = []
    current_len = 0
    for p in paragraphs:
        if current_len + len(p) > 2000 and current_chunk:
            chunk_text = '\n\n'.join(current_chunk)
            chunks.append({
                'text': chunk_text,
                'section_reference': '15 U.S.C. § 2063',
                'heading': 'Consumer Product Safety Act - Section 2063'
            })
            current_chunk = [p]
            current_len = len(p)
        else:
            current_chunk.append(p)
            current_len += len(p)
    if current_chunk:
        chunk_text = '\n\n'.join(current_chunk)
        chunks.append({
            'text': chunk_text,
            'section_reference': '15 U.S.C. § 2063',
            'heading': 'Consumer Product Safety Act - Section 2063'
        })
    return chunks

def generate_embeddings(model, chunks):
    texts = [c['text'] for c in chunks]
    embeddings = model.encode(texts, normalize_embeddings=True)
    result = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        emb_list = emb.tolist() if hasattr(emb, 'tolist') else list(emb)
        if len(emb_list) != EMBEDDING_DIM:
            raise ValueError(f"Embedding dim {len(emb_list)} != {EMBEDDING_DIM}")
        for x in emb_list:
            if not isinstance(x, (int, float)) or (isinstance(x, float) and (x != x)):
                raise ValueError("Invalid embedding values")
        result.append({
            **chunk,
            'embedding': emb_list,
            'chunk_index': i,
            'content_hash': hashlib.sha256(chunk['text'].encode()).hexdigest(),
            'token_count': len(chunk['text'].split())
        })
    return result

def send_to_ingest_endpoint(chunks_with_meta):
    endpoint = os.environ.get('INGEST_ENDPOINT', 'http://localhost:3000/api/ingest/legal')
    token = os.environ.get('INGEST_WORKER_TOKEN', '')
    payload = {
        'source': {
            'country_code': 'US',
            'source_name': 'GovInfo',
            'source_url': 'https://www.govinfo.gov/',
            'source_type': 'api',
            'authority_level': 'official',
            'language': 'en'
        },
        'document': {
            'country_code': 'US',
            'category': 'consumer_safety',
            'document_number': 'USCODE-2024-title15-chap47-sec2063',
            'title': '15 U.S.C. § 2063 - Product certification and labeling',
            'language': 'en',
            'official_html_url': 'https://api.govinfo.gov/packages/USCODE-2024-title15/granules/USCODE-2024-title15-chap47-sec2063/htm',
            'publication_date': '2024-01-01',
            'legal_status': 'unknown',
            'edition': '2024 (historical)',
            'content_hash': hashlib.sha256(json.dumps(chunks_with_meta).encode()).hexdigest()
        },
        'chunks': chunks_with_meta
    }
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    resp = requests.post(endpoint, json=payload, headers=headers, timeout=60)
    if resp.status_code != 200:
        print(f"\nIngest endpoint error {resp.status_code}: {resp.text[:200]}")
        print("This usually means the Supabase migration hasn't been applied yet.")
        print("Run the SQL in supabase/migrations/20261101000000_create_legal_rag_schema.sql")
        print("in your Supabase SQL editor: https://supabase.com/dashboard/project/bscbkhwxbcveirrqcblb/sql/new")
        return None
    return resp.json()

if __name__ == '__main__':
    api_key = os.environ.get('GOVINFO_API_KEY', 'YOUR_GOVINFO_API_KEY')
    model = get_model()
    html = fetch_govinfo_granule(api_key)
    text = parse_html(html)
    chunks = chunk_text(text)
    chunks_with_emb = generate_embeddings(model, chunks)
    print(f"Generated {len(chunks_with_emb)} chunks with {EMBEDDING_DIM} dims")
    result = send_to_ingest_endpoint(chunks_with_emb)
    print(json.dumps(result))
