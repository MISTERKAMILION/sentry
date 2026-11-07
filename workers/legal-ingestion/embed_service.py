#!/usr/bin/env python3
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

app = FastAPI()
MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
model = None

class EmbedRequest(BaseModel):
    text: str

class EmbedResponse(BaseModel):
    embedding: list
    model: str
    dim: int

@app.on_event("startup")
def load_model():
    global model
    model = SentenceTransformer(MODEL_NAME)
    print(f"Loaded {MODEL_NAME}, dim={model.get_sentence_embedding_dimension()}")

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    try:
        emb = model.encode(req.text, normalize_embeddings=True)
        if len(emb) != 384:
            raise HTTPException(status_code=500, detail=f"Invalid dim {len(emb)}")
        return EmbedResponse(embedding=emb.tolist(), model=MODEL_NAME, dim=384)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
