# AI-Powered CV & Project Evaluator Backend

A backend service that automates initial screening of job applications by evaluating a candidate’s CV and case study project report against ground-truth documents (Job Description, Case Study Brief, Scoring Rubrics) using RAG + LLM chaining. Built with Express.js, BullMQ, and a vector database.

## Table of Contents
- Features
- Architecture Overview
- Tech Stack
- Quick Start
- Configuration
- Data Model
- API Endpoints
- Evaluation Pipeline (LLM Chaining)
- RAG Strategy
- Error Handling & Resilience
- Observability
- Testing
- Deployment
- Design Decisions
- Future Improvements

---

## Features
- File uploads (CV + Project Report) with storage and file IDs
- Async evaluation pipeline (queue + worker)
- RAG retrieval from ground-truth documents (JD, Case Brief, Rubrics)
- Deterministic LLM outputs with JSON schema validation
- Job status tracking and final results retrieval
- Robust retries/backoff and dead-letter handling
- Clear logs and metrics per stage

---

## Architecture Overview
- HTTP API (Express.js): /upload, /evaluate, /result/:id
- Queue orchestration (BullMQ + Redis) for long-running LLM tasks
- Storage:
  - PDFs (CV + Report + ground-truth docs): local/S3
  - Metadata/results: Postgres
  - Vector DB: Qdrant/Chroma for embeddings + retrieval
- LLM Provider: OpenAI/Gemini/OpenRouter (direct SDK calls)
- Three-stage chain:
  1) CV Evaluation → cv_match_rate, cv_feedback
  2) Project Evaluation → project_score, project_feedback
  3) Final Synthesis → overall_summary

---

## Tech Stack
- Runtime: Node.js (TypeScript)
- Web: Express.js
- Queue: BullMQ + Redis
- DB: Postgres (with Prisma/TypeORM)
- Vector DB: Qdrant or Chroma
- LLM: OpenAI/Gemini/OpenRouter SDKs
- Validation: Zod/Ajv
- Logging: pino/winston
- Env: dotenv

---

## Quick Start
1) Prerequisites
- Node 18+
- Postgres
- Redis
- Qdrant (Docker) or Chroma
- LLM API key (e.g., OPENAI_API_KEY)

2) Clone & Install
- git clone <your-repo>
- cd ai-cv-evaluator
- npm install

3) Environment
- Copy .env.example to .env and fill:
  - DATABASE_URL=postgres://user:pass@host:5432/db
  - REDIS_URL=redis://localhost:6379
  - VECTOR_DB_URL=http://localhost:6333 (if Qdrant)
  - OPENAI_API_KEY=...
  - STORAGE_DIR=./storage

4) Migrate DB
- npm run db:migrate

5) Ingest Ground-Truth Docs
- Put PDFs under ./ground-truth:
  - job-description.pdf (or multiple variants)
  - case-study-brief.pdf
  - cv-scoring-rubric.pdf
  - project-scoring-rubric.pdf
- Run:
  - npm run ingest:ground-truth
  - This script chunks PDFs, generates embeddings, and upserts to the vector DB with metadata tags.

6) Run Services
- npm run dev (API server)
- npm run worker (queue worker)

---

## Configuration
- Top-K retrieval: RAG_TOP_K=6
- Embedding model: EMBEDDING_MODEL=text-embedding-3-small
- LLM model: LLM_MODEL=gpt-4o-mini (example)
- Temperature: LLM_TEMPERATURE=0.1
- Queue attempts/backoff:
  - EVAL_MAX_ATTEMPTS=5
  - EVAL_BACKOFF_MS=1000–10000 (exponential + jitter)
- Context filters (metadata):
  - scope=cv → doc_type in [job_description, cv_rubric]
  - scope=project → doc_type in [case_brief, project_rubric]

---

## Data Model (simplified)
- jobs(id, status, created_at, updated_at, error_code, attempts)
- job_artifacts(id, job_id, stage, payload_json, version, created_at)
- files(id, type: 'cv'|'report', storage_uri, checksum, created_at)
- documents(id, type: 'job_description'|'case_brief'|'cv_rubric'|'project_rubric', version, storage_uri)
- embeddings(doc_id, chunk_id, vector_ref, metadata) // stored as references; vectors live in Qdrant/Chroma

---

## API Endpoints

### POST /upload
- multipart/form-data: cv (PDF), report (PDF)
- Returns:
  {
    "cvFileId": "file_123",
    "reportFileId": "file_456"
  }

### POST /evaluate
- body: { "jobTitle": "Product Engineer (Backend)", "cvFileId": "...", "reportFileId": "..." }
- Returns immediately:
  {
    "id": "job_789",
    "status": "queued"
  }

### GET /result/:id
- While queued/processing:
  {
    "id": "job_789",
    "status": "queued" | "processing"
  }
- When completed:
  {
    "id": "job_789",
    "status": "completed",
    "result": {
      "cv_match_rate": 0.82,
      "cv_feedback": "…",
      "project_score": 4.5,
      "project_feedback": "…",
      "overall_summary": "…"
    }
  }

---

## Evaluation Pipeline (LLM Chaining)

### Stage S1: CV Evaluation
1. Parse CV (PDF → text → structured fields: name, years, tech stack, roles, achievements).
2. RAG retrieve ground-truth:
   - Filter: doc_type in [job_description, cv_rubric], meta scope="cv"
   - top_k=RAG_TOP_K
3. LLM prompt (system + context + user), return JSON:
   - {
     "parameters": {
       "technical_skills": 1–5,
       "experience_level": 1–5,
       "relevant_achievements": 1–5,
       "cultural_fit": 1–5
     },
     "weighted_average_1_to_5": number,
     "cv_match_rate": number (0–1 via ×0.2),
     "cv_feedback": string
   }
4. Validate (Zod/Ajv), clamp ranges, recompute weighted average server-side for integrity.
5. Persist artifact S1.

### Stage S2: Project Evaluation
1. Parse Report (architecture, endpoints, queueing, retries/backoff, prompt design, chaining, RAG strategy, tests, docs).
2. RAG retrieve ground-truth:
   - Filter: doc_type in [case_brief, project_rubric], meta scope="project"
   - top_k=RAG_TOP_K
3. LLM prompt returns JSON:
   - {
     "parameters": {
       "correctness": 1–5,
       "code_quality": 1–5,
       "resilience": 1–5,
       "documentation": 1–5,
       "creativity": 1–5
     },
     "project_score": number (weighted 1–5),
     "project_feedback": string
   }
4. Validate + clamp + recompute weighted average server-side.
5. Persist artifact S2.

### Stage S3: Final Synthesis
1. Input: S1 + S2 outputs (no heavy RAG; optionally small rubric quotes).
2. LLM prompt returns:
   - { "overall_summary": string (3–5 sentences) }
3. Validate non-empty; persist artifact S3; mark job completed.

---

## RAG Strategy
- Ground-truth index only:
  - Job Description(s)
  - Case Study Brief
  - CV Scoring Rubric
  - Project Scoring Rubric
- Candidate docs are NOT in the core index. If quoting is needed, create a per-job scratch index and delete after completion.
- Chunking: 512–1024 tokens with overlap 64–128; store metadata: doc_type, section, version, scope.
- Retrieval:
  - Query templates tuned per stage (e.g., “backend technical skills alignment” for S1).
  - Re-rank or hybrid search (optional): semantic + keyword.

---

## Error Handling & Resilience
- Retries: exponential backoff with jitter for LLM/timeouts/rate limits.
- Circuit breaker: pause stage after N failures; send to dead-letter queue.
- Idempotency: hash(prompt + context + model) and reuse parsed data on retries.
- Determinism:
  - temperature=0–0.2
  - enforce JSON schema parsing; reject non-conforming responses
  - server-side recomputation of weighted scores
- Timeouts: per-call hard timeout; cancel token.
- Fallbacks: reduce context window or top_k if token limits hit.

---

## Observability
- Structured logs per stage: request_id, job_id, model, tokens, latency, attempts.
- Metrics: success/failure counts, retry rates, time per stage, context size.
- Traces: optional OpenTelemetry for API + worker.

---

## Testing
- Unit tests:
  - CV parser, Report parser
  - RAG retrieval filters
  - Score aggregation functions
- Integration tests:
  - /upload → /evaluate → /result flow (mock LLM)
  - Queue retries/backoff behavior
- Determinism tests:
  - Same inputs → same outputs across retries (with fixed temperature)

---

## Deployment
- Docker-compose: api, worker, redis, postgres, qdrant
- Env secrets via Docker .env or platform secrets manager
- Health checks: /health for API; worker heartbeat
- Storage: bind mount or S3 for PDFs
- Scaling: horizontal workers; rate-limit LLM calls per worker

---

## Design Decisions (Highlights)
- Express.js + direct SDK calls for transparency and control
- BullMQ for long-running tasks with clear state machine
- Separate ground-truth RAG index; scratch index for candidate quoting if needed
- JSON schema validation + server-side scoring to reduce randomness
- Versioned prompts and context to ensure reproducibility

---

## Future Improvements
- Add authentication & RBAC for upload/result endpoints
- Admin dashboard for job monitoring and artifact inspection
- Hybrid retrieval (BM25 + embeddings) and re-ranking
- Guardrails with function-calling or toolformer-style schemas
- Fine-tuned evaluator model or reward modeling for scoring stability