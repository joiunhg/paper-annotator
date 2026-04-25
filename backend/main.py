"""
FastAPI backend for paper-annotator
- Translation proxy (Youdao)
- PDF document storage
- Annotation storage
- Anonymous sharing
"""
import os
import uuid
import sqlite3
import hashlib
import time
import json
from pathlib import Path
from contextlib import contextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
import httpx
import random

# ─── Config ──────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
PDF_DIR = BASE_DIR / "pdfs"
DATA_DIR.mkdir(exist_ok=True)
PDF_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "paper_annotator.db"

YOUDAO_APP_KEY = os.getenv("YOUDAO_APP_KEY", "")
YOUDAO_APP_SECRET = os.getenv("YOUDAO_APP_SECRET", "")

# Max PDF size: 50MB
MAX_PDF_SIZE = 50 * 1024 * 1024

# ─── Database ────────────────────────────────────────────────────────────────
def init_db():
    with get_db() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id          TEXT PRIMARY KEY,
                filename    TEXT NOT NULL,
                size        INTEGER NOT NULL,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            )
        """)
        db.execute("""
            CREATE TABLE IF NOT EXISTS annotations (
                id          TEXT PRIMARY KEY,
                doc_id      TEXT NOT NULL,
                page        INTEGER NOT NULL,
                text        TEXT NOT NULL DEFAULT '',
                note        TEXT NOT NULL DEFAULT '',
                color       TEXT NOT NULL DEFAULT '#ffeb3b',
                rects       TEXT NOT NULL DEFAULT '[]',
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL,
                FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
            )
        """)
        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_annos_doc ON annotations(doc_id)
        """)

@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30)
    conn.row_factory = sqlite3.Row
    try:
        yield conn.cursor()
        conn.commit()
    finally:
        conn.close()

# ─── Helpers ──────────────────────────────────────────────────────────────────
def doc_key() -> str:
    """Generate a short, URL-safe document ID."""
    return uuid.uuid4().hex[:12]

def anno_key() -> str:
    return uuid.uuid4().hex[:12]

# ─── App ─────────────────────────────────────────────────────────────────────
app = FastAPI(title="paper-annotator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # Vercel frontend domain goes here in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}

# ─── Translation ──────────────────────────────────────────────────────────────
@app.get("/translate")
async def translate(q: str = Query(...)):
    if not YOUDAO_APP_KEY or not YOUDAO_APP_SECRET:
        return {"errorCode": "1", "query": q, "translation": []}

    salt = str(random.randint(1, 100000))
    sign_str = f"{YOUDAO_APP_KEY}{q}{salt}{YOUDAO_APP_SECRET}"
    sign = hashlib.md5(sign_str.encode()).hexdigest()

    url = "https://openapi.youdao.com/api"
    params = {
        "q": q, "from": "en", "to": "zh-CHS",
        "appKey": YOUDAO_APP_KEY, "salt": salt, "sign": sign,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, params=params)
        return resp.json()

# ─── Document APIs ─────────────────────────────────────────────────────────────

@app.post("/docs/upload")
async def upload_pdf(file: UploadFile = File(...)):
    """Upload a PDF and return a shareable document ID."""
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    size = len(content)

    if size == 0:
        raise HTTPException(400, "Empty file")
    if size > MAX_PDF_SIZE:
        raise HTTPException(413, f"File too large (max {MAX_PDF_SIZE // 1024 // 1024}MB)")

    doc_id = doc_key()
    pdf_path = PDF_DIR / f"{doc_id}.pdf"
    pdf_path.write_bytes(content)

    now = time.time()
    with get_db() as db:
        db.execute(
            "INSERT INTO documents (id, filename, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (doc_id, file.filename, size, now, now),
        )

    return {"docId": doc_id, "filename": file.filename, "size": size }


@app.get("/docs/{doc_id}")
async def get_document(doc_id: str):
    """Return document metadata (no PDF bytes – for the list view)."""
    with get_db() as db:
        db.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = db.fetchone()

    if not row:
        raise HTTPException(404, "Document not found")

    return dict(row)


@app.get("/docs/{doc_id}/pdf")
async def serve_pdf(doc_id: str):
    """Stream the PDF file."""
    pdf_path = PDF_DIR / f"{doc_id}.pdf"
    if not pdf_path.exists():
        raise HTTPException(404, "PDF file not found on disk")

    with get_db() as db:
        db.execute("SELECT filename FROM documents WHERE id = ?", (doc_id,))
        row = db.fetchone()
    filename = row["filename"] if row else "document.pdf"

    return FileResponse(
        str(pdf_path),
        media_type="application/pdf",
        filename=filename,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.delete("/docs/{doc_id}")
async def delete_document(doc_id: str):
    """Delete a document and all its annotations."""
    pdf_path = PDF_DIR / f"{doc_id}.pdf"
    if pdf_path.exists():
        pdf_path.unlink()

    with get_db() as db:
        db.execute("DELETE FROM annotations WHERE doc_id = ?", (doc_id,))
        db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))

    return {"deleted": doc_id}


# ─── Annotation APIs ──────────────────────────────────────────────────────────

@app.get("/docs/{doc_id}/annotations")
async def list_annotations(doc_id: str):
    """List all annotations for a document."""
    with get_db() as db:
        db.execute("SELECT * FROM annotations WHERE doc_id = ? ORDER BY page, created_at", (doc_id,))
        rows = db.fetchall()
    annos = []
    for r in rows:
        d = dict(r)
        d["rects"] = json.loads(d["rects"])
        annos.append(d)
    return annos


@app.post("/docs/{doc_id}/annotations")
async def save_annotations(doc_id: str, payload: dict):
    """
    Save or update an annotation.
    payload: { id?, page, text, note, color, rects }
    """
    now = time.time()
    with get_db() as db:
        db.execute("SELECT 1 FROM documents WHERE id = ?", (doc_id,))
        if not db.fetchone():
            raise HTTPException(404, "Document not found")

        anno_id = payload.get("id") or anno_key()
        rects = json.dumps(payload.get("rects", []))
        db.execute("""
            INSERT INTO annotations (id, doc_id, page, text, note, color, rects, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                page = excluded.page, text = excluded.text, note = excluded.note,
                color = excluded.color, rects = excluded.rects, updated_at = excluded.updated_at
        """, (anno_id, doc_id, payload["page"], payload.get("text", ""),
              payload.get("note", ""), payload.get("color", "#ffeb3b"),
              rects, now, now))

        db.execute("UPDATE documents SET updated_at = ? WHERE id = ?", (now, doc_id))

    return {"id": anno_id, "updated": now}


@app.delete("/docs/{doc_id}/annotations/{anno_id}")
async def delete_annotation(doc_id: str, anno_id: str):
    with get_db() as db:
        db.execute("DELETE FROM annotations WHERE id = ? AND doc_id = ?", (anno_id, doc_id))
    return {"deleted": anno_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=3456)
