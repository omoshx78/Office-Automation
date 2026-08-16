import io
from typing import List

import pdfplumber
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse

app = FastAPI(title="PDF Extraction Service")

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25MB


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/extract-tables")
async def extract_tables(file: UploadFile = File(...)):
    """
    Extract tables from a PDF using pdfplumber's table detection, which
    handles ruled/bordered tables and most whitespace-aligned tables far
    better than naive text-splitting. Returns one entry per page with a
    list of tables found on that page (each table is a 2D array of cell
    strings).
    """
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large")

    pages_out: List[dict] = []
    try:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for i, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                pages_out.append({
                    "page": i + 1,
                    "tables": tables,  # list of 2D arrays
                    "text": page.extract_text() or "",
                })
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {exc}")

    return JSONResponse({"pages": pages_out})


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    """Plain text extraction, page by page (for narrative documents)."""
    contents = await file.read()
    if len(contents) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large")

    pages_out = []
    try:
        with pdfplumber.open(io.BytesIO(contents)) as pdf:
            for i, page in enumerate(pdf.pages):
                pages_out.append({"page": i + 1, "text": page.extract_text() or ""})
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {exc}")

    return JSONResponse({"pages": pages_out})
