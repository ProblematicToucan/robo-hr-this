# CV RAG - AI-Powered CV & Project Evaluator

A sophisticated backend service that automates initial screening of job applications by evaluating a candidate's CV and case study project report against ground-truth documents using RAG (Retrieval-Augmented Generation) + LLM chaining. Built with Express.js, BullMQ, and vector database technology.

## 🚀 Features

- **File Upload System**: Secure upload and storage of CV and project report PDFs
- **Async Evaluation Pipeline**: Queue-based processing with BullMQ and Redis
- **RAG-Powered Analysis**: Retrieval from ground-truth documents (Job Description, Case Study Brief, Rubrics)
- **3-Stage LLM Evaluation Chain**:
  - **Stage S1**: CV Evaluation → cv_match_rate, cv_feedback
  - **Stage S2**: Project Evaluation → project_score, project_feedback  
  - **Stage S3**: Final Synthesis → overall_summary
- **Deterministic Outputs**: JSON schema validation with server-side score recomputation
- **Robust Error Handling**: Exponential backoff, retries, and dead-letter queue management
- **Comprehensive Logging**: Structured logs with request tracing and metrics

## 🏗️ Architecture

The system uses a microservices architecture with the following components:
- **Express API**: REST endpoints for file upload, evaluation, and results
- **BullMQ Queue**: Async job processing with Redis as the message broker
- **Vector Database**: Qdrant for storing and retrieving document embeddings
- **PostgreSQL**: Metadata storage for jobs, files, and results
- **File Storage**: Local storage for uploaded PDFs
- **OpenAI API**: LLM processing and embedding generation

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Web Framework**: Express.js
- **Queue System**: BullMQ + Redis
- **Database**: PostgreSQL with TypeORM
- **Vector Database**: Qdrant
- **LLM Provider**: OpenAI (GPT-4o-mini, text-embedding-3-small)
- **File Processing**: PDF parsing with pdf-parse
- **Validation**: Zod schemas
- **Logging**: Pino with structured logging
- **Testing**: Vitest with comprehensive test coverage

## 📋 Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Qdrant (Docker)
- OpenAI API key

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd cv-rag
npm install
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgres://pguser:pgpassword@localhost:5432/rag

# Redis
REDIS_URL=redis://localhost:6379

# Vector Database
VECTOR_DB_URL=http://localhost:6333

# OpenAI
OPENAI_API_KEY=your_openai_api_key_here

# Storage
STORAGE_DIR=./storage

# RAG Configuration
RAG_TOP_K=6
EMBEDDING_MODEL=text-embedding-3-small
LLM_MODEL=gpt-4o-mini
LLM_TEMPERATURE=0.1

# Queue Configuration
EVAL_MAX_ATTEMPTS=5
EVAL_BACKOFF_MS=1000
```

### 3. Start Infrastructure

```bash
# Start PostgreSQL, Redis, and Qdrant with Docker Compose
docker-compose up -d
```

### 4. Database Setup

```bash
# Run database migrations
npm run migration:run
```

### 5. Start the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production mode
npm run build
npm start
```

### 6. Ingest Ground-Truth Documents

Place your ground-truth PDFs in the `src/ground/` directory:
- `Job Description.pdf`
- `Case Study Brief.pdf` 
- `CV Rubric.pdf`
- `Project Rubric.pdf`

```bash
# Ingest all documents from the ground directory
curl -X POST http://localhost:3000/ingest/directory \
  -H "Content-Type: application/json" \
  -d '{"directoryPath": "src/ground"}'
```

## 📚 API Endpoints

### File Management

#### `POST /upload`
Upload CV and project report files.

**Request:**
```bash
curl -X POST http://localhost:3000/upload \
  -F "cv=@path/to/cv.pdf" \
  -F "report=@path/to/report.pdf"
```

**Response:**
```json
{
  "cvFileId": 123,
  "reportFileId": 456
}
```

### Evaluation System

#### `POST /evaluate`
Start the evaluation process.

**Request:**
```json
{
  "jobTitle": "Product Engineer (Backend)",
  "cvFileId": 123,
  "reportFileId": 456
}
```

**Response:**
```json
{
  "id": 789,
  "status": "queued"
}
```

#### `GET /result/:id`
Get evaluation results.

**Response (Processing):**
```json
{
  "id": 789,
  "status": "queued" | "processing"
}
```

**Response (Completed):**
```json
{
  "id": 789,
  "status": "completed",
  "result": {
    "cv_match_rate": 0.82,
    "cv_feedback": "Strong technical background with relevant experience...",
    "project_score": 4.5,
    "project_feedback": "Well-structured project with good architecture...",
    "overall_summary": "Candidate shows strong potential with excellent technical skills..."
  }
}
```

### Document Ingestion

#### `POST /ingest/document`
Ingest a single ground-truth document.

#### `POST /ingest/directory`
Ingest all PDFs from a directory.

#### `GET /ingest/documents`
List all processed documents.

#### `DELETE /ingest/documents/:id`
Delete a document and its embeddings.

#### `GET /ingest/test`
Test the RAG system with sample queries.

### System

#### `GET /health`
Health check endpoint.

#### `GET /`
API information and available endpoints.

## 🔄 Evaluation Pipeline

### Stage S1: CV Evaluation
1. **Parse CV**: Extract structured fields (name, experience, skills, achievements)
2. **RAG Retrieval**: Get relevant context from job description and CV rubric
3. **LLM Analysis**: Generate scores and feedback using OpenAI
4. **Validation**: Ensure deterministic outputs with JSON schema validation

### Stage S2: Project Evaluation  
1. **Parse Report**: Extract project details (architecture, implementation, testing)
2. **RAG Retrieval**: Get context from case study brief and project rubric
3. **LLM Analysis**: Evaluate project quality and implementation
4. **Validation**: Score validation and feedback generation

### Stage S3: Final Synthesis
1. **Combine Results**: Merge S1 and S2 outputs
2. **Final Analysis**: Generate overall summary and recommendation
3. **Complete Job**: Mark evaluation as completed

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## 📊 Database Schema

### Core Entities

- **jobs**: Evaluation job tracking
- **job_artifacts**: Stage-specific results and metadata
- **files**: Uploaded CV and project files
- **documents**: Ground-truth documents (JD, rubrics, briefs)
- **embeddings**: Vector references for RAG retrieval

## 🔧 Configuration

### RAG Settings
- **Top-K Retrieval**: `RAG_TOP_K=6` (number of relevant chunks)
- **Embedding Model**: `text-embedding-3-small`
- **LLM Model**: `gpt-4o-mini`
- **Temperature**: `0.1` (for deterministic outputs)

### Queue Settings
- **Max Attempts**: `EVAL_MAX_ATTEMPTS=5`
- **Backoff Strategy**: Exponential with jitter
- **Retry Logic**: Configurable per stage

## 🚀 Deployment

### Docker Compose
The project includes a `compose.yml` file for easy deployment:

```bash
docker-compose up -d
```

### Environment Variables
All configuration is managed through environment variables. See the `.env` example above.

### Health Checks
- API: `GET /health`
- Database: Connection validation
- Vector DB: Qdrant health check
- Queue: Worker status monitoring

## 🔍 Monitoring & Observability

- **Structured Logging**: JSON logs with request tracing
- **Metrics**: Success/failure rates, processing times, retry counts
- **Error Tracking**: Comprehensive error handling with context
- **Performance**: Token usage, latency tracking, queue metrics

## 🛡️ Error Handling

- **Retry Logic**: Exponential backoff with jitter
- **Circuit Breaker**: Automatic failure detection and recovery
- **Dead Letter Queue**: Failed jobs for manual inspection
- **Idempotency**: Safe retry mechanisms
- **Validation**: Input/output schema validation

## 🔮 Future Improvements

- [ ] Authentication & RBAC for secure access
- [ ] Admin dashboard for job monitoring
- [ ] Hybrid retrieval (BM25 + embeddings)
- [ ] Fine-tuned evaluation models
- [ ] Multi-language support
- [ ] Advanced analytics and reporting

## 📝 License

ISC License

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📞 Support

For questions and support, please open an issue in the repository.

---

**Built with ❤️ using Node.js, TypeScript, and OpenAI**
