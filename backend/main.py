import html
import io
import logging
import os
from typing import List

import pymupdf
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

load_dotenv()
logger = logging.getLogger(__name__)
app = FastAPI(title="AI Research Paper Analyzer API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGIN", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class PaperAnalysisResponse(BaseModel):
    title: str = Field(default="", description="Title of the research paper")
    abstract_summary: str = Field(default="", description="A professional summary of the paper")
    key_insights: List[str] = Field(default_factory=list, description="Major findings")
    methodology: str = Field(default="", description="Methods or models used")
    limitations: List[str] = Field(default_factory=list, description="Limitations or future work")
    qa_pairs: List[dict] = Field(default_factory=list, description="A few important question and answer pairs")


class ChatRequest(BaseModel):
    question: str
    paper_text: str


def get_llm():
    if not os.getenv("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="GROQ_API_KEY is missing. Add it to backend/.env and restart the API.")
    try:
        from langchain_groq import ChatGroq
        return ChatGroq(model=os.getenv("GROQ_MODEL", "openai/gpt-oss-20b"), temperature=0)
    except ImportError as exc:
        raise HTTPException(status_code=503, detail="The Groq integration is not installed. Install backend/requirements.txt.") from exc


def extract_text_from_pdf(file_bytes: bytes) -> str:
    try:
        with pymupdf.open(stream=file_bytes, filetype="pdf") as doc:
            return "\n".join(page.get_text() for page in doc)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read this PDF: {exc}") from exc


def analyze_paper_text(text: str, fallback_title: str = "") -> dict:
    from langchain_core.prompts import ChatPromptTemplate
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a careful research assistant. Analyze only the supplied paper. Preserve the paper's main quantitative results, comparisons, and dataset sizes when present. Clearly say when information is absent; do not invent results. Return a concise summary, 5-7 key insights, methodology, limitations, and 3 useful question/answer pairs."),
        ("user", "Analyze this research paper:\n\n{paper_text}"),
    ])
    structured = get_llm().with_structured_output(PaperAnalysisResponse)
    result = (prompt | structured).invoke({"paper_text": text[:30000]})
    data = result.model_dump() if hasattr(result, "model_dump") else result.dict()
    if not data.get("title"):
        data["title"] = fallback_title or "Untitled research paper"
    return data


@app.get("/api/health")
def health():
    return {"status": "ok", "configured": bool(os.getenv("GROQ_API_KEY"))}


@app.post("/api/analyze-pdf")
async def analyze_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Choose a PDF file.")
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="PDF is too large. The maximum file size is 20 MB.")
    text = extract_text_from_pdf(content)
    if not text.strip():
        raise HTTPException(status_code=400, detail="No selectable text was found. Scanned PDFs need OCR before analysis.")
    try:
        result = analyze_paper_text(text, fallback_title=os.path.splitext(file.filename)[0])
        result["paper_text"] = text[:30000]
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Paper analysis failed (%s)", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail="The AI service could not produce a complete analysis. Please try again. If this keeps happening, check the configured Groq model.",
        ) from None


@app.post("/api/chat")
def chat(request: ChatRequest):
    if not request.question.strip():
        raise HTTPException(status_code=400, detail="Enter a question.")
    from langchain_core.prompts import ChatPromptTemplate
    prompt = ChatPromptTemplate.from_messages([
        ("system", "Answer questions using only the supplied research paper. Search the full text for a directly relevant statement before answering. If the text contains relevant information, answer directly and preserve its exact numbers and names. Only say the paper does not specify something after checking the full text. Never guess, infer missing results, or add unsourced details."),
        ("user", "Paper:\n{paper_text}\n\nQuestion: {question}"),
    ])
    try:
        answer = (prompt | get_llm()).invoke({"paper_text": request.paper_text[:30000], "question": request.question})
        return {"answer": answer.content if hasattr(answer, "content") else str(answer)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Paper Q&A failed (%s)", type(exc).__name__)
        raise HTTPException(status_code=502, detail="The AI service could not answer that question. Please try again.") from None


@app.post("/api/download-report")
@app.post("/api/download-pdf")
def download_report(data: dict):
    try:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
        styles = getSampleStyleSheet()
        title = ParagraphStyle("ReportTitle", parent=styles["Heading1"], fontSize=18, leading=22, textColor="#1e293b", spaceAfter=12)
        heading = ParagraphStyle("ReportHeading", parent=styles["Heading2"], fontSize=14, leading=18, textColor="#334155", spaceBefore=10, spaceAfter=6)
        body = ParagraphStyle("ReportBody", parent=styles["Normal"], fontSize=10, leading=14, textColor="#475569", spaceAfter=8)
        safe = lambda value: html.escape(str(value)).replace("\n", "<br/>")
        story = [Paragraph("Research Analysis Report", title), Paragraph(f"<b>Paper:</b> {safe(data.get('title', 'Untitled'))}", body), Spacer(1, 8)]
        sections = [("Executive Summary", data.get("abstract_summary", data.get("summary", ""))), ("Key Insights", data.get("key_insights", [])), ("Methodology", data.get("methodology", "")), ("Limitations & Future Work", data.get("limitations", []))]
        for label, value in sections:
            story.append(Paragraph(label, heading))
            values = value if isinstance(value, list) else [value]
            story.extend(Paragraph(f"• {safe(item)}", body) for item in values if item)
        doc.build(story)
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="Research_Analysis_Report.pdf"'})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"PDF generation failed: {exc}") from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
