# AI Research Paper Analyzer

Upload a text based research paper PDF to generate a summary, key insights, methodology, limitations, and suggested questions. Ask follow-up questions grounded in the paper and download a PDF report.

## Run locally

1. Install Node.js and Python 3.10 or newer.
2. Install frontend packages with `npm install`.
3. Install backend packages with `python -m pip install -r backend/requirements.txt`.
4. Add a Groq API key to `backend/.env` as `GROQ_API_KEY=your_key`. The backend defaults to `openai/gpt-oss-20b`; set `GROQ_MODEL` to override it and `FRONTEND_ORIGIN` to change the allowed frontend origin.
5. In one terminal, start the API: `python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000`.
6. In another terminal, start the web app: `npm run dev`, then open `http://localhost:3000`.

Set `NEXT_PUBLIC_API_URL` before starting Next.js if the API is hosted somewhere other than `http://localhost:8000`. PDFs are limited to 20 MB; scanned image-only PDFs require OCR before upload.
