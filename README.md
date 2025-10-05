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
git clone https://github.com/ProblematicToucan/robo-hr-this.git
cd robo-hr-this
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Then edit the `.env` file and update the following key:

```env
# OpenAI - REQUIRED: Get your API key from https://platform.openai.com/api-keys
OPENAI_API_KEY=your_actual_openai_api_key_here
```

**Important:** You must replace `your_actual_openai_api_key_here` with your real OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys).

All other environment variables are pre-configured with sensible defaults for local development.

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

**Request Body:**
- `cv` (file): PDF file for CV (required)
- `report` (file): PDF file for project report (required)
- File size limit: 10MB per file
- Only PDF files are allowed

**Response:**
```json
{
  "cvFileId": 123,
  "reportFileId": 456
}
```

**Error Responses:**
```json
{
  "error": "Both CV and report files are required"
}
```

### Evaluation System

#### `POST /evaluate`
Start the evaluation process.

**Request Body:**
```json
{
  "jobTitle": "Product Engineer (Backend)",
  "cvFileId": 123,
  "reportFileId": 456
}
```

**Request Parameters:**
- `jobTitle` (string, required): Job title for evaluation context
- `cvFileId` (number, required): ID of uploaded CV file
- `reportFileId` (number, required): ID of uploaded report file

**Response:**
```json
{
  "id": 789,
  "status": "queued"
}
```

**Error Responses:**
```json
{
  "error": "Validation failed",
  "details": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "inclusive": true,
      "exact": false,
      "message": "Job title is required",
      "path": ["jobTitle"]
    }
  ]
}
```

#### `GET /result/:id`
Get evaluation results.

**URL Parameters:**
- `id` (number, required): Job ID to retrieve results for

**Response (Processing):**
```json
{
  "id": 789,
  "status": "processing" | "queued"
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

**Response (Failed):**
```json
{
  "id": 789,
  "status": "failed",
  "error": "Evaluation failed after maximum retry attempts",
  "error_code": "llm_timeout",
  "attempts": 5,
  "message": "The evaluation could not be completed due to service unavailability. Please try again later."
}
```

### Document Ingestion

#### `POST /ingest/document`
Ingest a single ground-truth document.

**Request Body:**
```json
{
  "documentPath": "/path/to/document.pdf",
  "documentType": "job_description",
  "version": "1.0"
}
```

**Request Parameters:**
- `documentPath` (string, required): Path to the PDF document
- `documentType` (enum, required): One of `job_description`, `case_brief`, `cv_rubric`, `project_rubric`
- `version` (string, optional): Document version (default: "1.0")

**Response:**
```json
{
  "success": true,
  "document": {
    "id": 123,
    "type": "job_description",
    "version": "1.0",
    "storage_uri": "/path/to/stored/document.pdf",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

#### `POST /ingest/directory`
Ingest all PDF documents from a directory.

**Request Body:**
```json
{
  "directoryPath": "src/ground"
}
```

**Request Parameters:**
- `directoryPath` (string, required): Path to directory containing PDF files

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": 123,
      "type": "job_description",
      "version": "1.0",
      "storage_uri": "/path/to/document1.pdf",
      "created_at": "2024-01-15T10:30:00Z"
    },
    {
      "id": 124,
      "type": "cv_rubric",
      "version": "1.0",
      "storage_uri": "/path/to/document2.pdf",
      "created_at": "2024-01-15T10:31:00Z"
    }
  ],
  "count": 2
}
```

#### `GET /ingest/documents`
List all processed documents.

**Request:** No body required

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": 123,
      "type": "job_description",
      "version": "1.0",
      "storage_uri": "/path/to/document.pdf",
      "created_at": "2024-01-15T10:30:00Z"
    }
  ],
  "stats": {
    "total_documents": 4,
    "by_type": {
      "job_description": 1,
      "case_brief": 1,
      "cv_rubric": 1,
      "project_rubric": 1
    }
  }
}
```

#### `DELETE /ingest/documents/:id`
Delete a document and its embeddings.

**URL Parameters:**
- `id` (number, required): Document ID to delete

**Response:**
```json
{
  "success": true,
  "message": "Document deleted successfully"
}
```

#### `GET /ingest/test`
Test the RAG system with sample queries.

**Request:** No body required

**Response:**
```json
{
  "success": true,
  "testResults": {
    "cv_context_test": {
      "query": "backend technical skills",
      "results": [
        {
          "document_type": "job_description",
          "chunk_text": "Required skills: Node.js, TypeScript...",
          "score": 0.95
        }
      ]
    },
    "project_context_test": {
      "query": "project evaluation criteria",
      "results": [
        {
          "document_type": "project_rubric",
          "chunk_text": "Evaluation criteria: architecture, testing...",
          "score": 0.88
        }
      ]
    }
  },
  "stats": {
    "total_vectors": 150,
    "collections": ["documents"],
    "embedding_model": "text-embedding-3-small"
  }
}
```

#### `POST /ingest/cleanup`
Clean up orphaned records (documents without corresponding vectors).

**Request:** No body required

**Response:**
```json
{
  "success": true,
  "message": "Orphaned records cleanup completed",
  "result": {
    "orphaned_documents": 2,
    "orphaned_embeddings": 15,
    "cleaned_up": true
  }
}
```

#### `GET /ingest/openai-test`
Test OpenAI connection and embedding generation.

**Request:** No body required

**Response:**
```json
{
  "success": true,
  "message": "OpenAI connection and embedding generation successful",
  "results": {
    "connected": true,
    "embeddingDimension": 1536,
    "testText": "This is a test for OpenAI embedding generation",
    "embeddingSample": [0.123, -0.456, 0.789, -0.321, 0.654]
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "OpenAI connection failed",
  "message": "Check your OPENAI_API_KEY or EMBEDDING_MODEL environment variable"
}
```

#### `POST /ingest/update`
Update an existing document with new version.

**Request Body:**
```json
{
  "documentId": 123,
  "filePath": "/path/to/new/document.pdf",
  "newVersion": "2.0"
}
```

**Request Parameters:**
- `documentId` (number, required): ID of document to update
- `filePath` (string, required): Path to new document file
- `newVersion` (string, required): New version number

**Response:**
```json
{
  "success": true,
  "message": "Document updated successfully",
  "document": {
    "id": 123,
    "type": "job_description",
    "version": "2.0",
    "storage_uri": "/path/to/new/document.pdf",
    "updated_at": "2024-01-15T11:00:00Z"
  }
}
```

### System

#### `GET /health`
Health check endpoint.

**Request:** No body required

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### `GET /`
API information and available endpoints.

**Request:** No body required

**Response:**
```json
{
  "message": "AI-Powered CV & Project Evaluator API",
  "version": "1.0.0",
  "description": "Automated CV and project evaluation using RAG + LLM chaining",
  "endpoints": {
    "File Management": {
      "POST /upload": "Upload CV and project files"
    },
    "Evaluation System": {
      "POST /evaluate": "Start evaluation (async)",
      "GET /result/:id": "Get evaluation results"
    },
    "Document Ingestion": {
      "POST /ingest/document": "Ingest single ground-truth document",
      "POST /ingest/directory": "Ingest all PDFs from directory",
      "GET /ingest/documents": "List all processed documents",
      "DELETE /ingest/documents/:id": "Delete document and embeddings",
      "GET /ingest/test": "Test RAG system with sample queries"
    },
    "System": {
      "GET /health": "Health check",
      "GET /": "API information"
    }
  },
  "infrastructure": {
    "Queue System": "BullMQ with Redis",
    "Vector Database": "Qdrant",
    "Database": "PostgreSQL with TypeORM",
    "LLM": "OpenAI (ready for integration)"
  }
}
```

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
