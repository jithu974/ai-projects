================================================================================
                         DATA ASSISTANT - SYSTEM ARCHITECTURE
================================================================================

[ Web UI / API Clients ]
           |
           v  (HTTPS + OIDC/JWT)
+------------------------------------------------------------------------------+
|                   TYPESCRIPT MODULAR MONOLITH (Fastify)                      |
|                                                                              |
|  +-----------------------+  +--------------------+  +---------------------+  |
|  | API & Security Layer  |  | Query Orchestrator |  | Ingestion Manager   |  |
|  | - AuthN / AuthZ (JWT) |  | - Rewrite & Route  |  | - Upload Validation |  |
|  | - Rate Limiting       |  | - Cache Lookup     |  | - SHA-256 Dedupe    |  |
|  | - Zod Schemas         |  | - Hybrid Retrieval |  | - Job Enqueue       |  |
|  +-----------------------+  | - Rerank & Budget  |  +----------+----------+  |
|                             | - Grounded Prompt  |             |             |
|                             | - Citation Verify  |             v             |
|                             +---------+----------+  [ BullMQ Worker Pool ]   |
|                                       |                        |             |
+---------------------------------------+------------------------+-------------+
                                        |                        |
       +--------------------------------+--------+               | (Internal HTTP)
       |                |               |        |               v
       v                v               v        |    +---------------------+
+------------+   +------------+  +------------+  |    | PYTHON DOC SIDECAR  |
| PostgreSQL |   |   Qdrant   |  |   Redis    |  |    | (FastAPI + Docling) |
| - Metadata |   | - Dense    |  | - Queues   |  |    | - PDF/DOCX/XLSX     |
| - Versions |   | - Sparse   |  | - L1/L2    |  |    | - Layout & Tables   |
| - ACLs/RLS |   | - ACL Meta |  |   Cache    |  |    | - Page Coordinates  |
| - Chat/Logs|   | - Vectors  |  | - Rate Lim |  |    +---------------------+
+------------+   +------------+  +------------+  |
                                                 v
                                       +-------------------+
                                       | External AI APIs  |
                                       | - LLM Providers   |
                                       | - Embedders       |
                                       | - Rerankers       |
                                       +-------------------+
       +---------------------------------------------------------------+
       | CROSS-CUTTING: OpenTelemetry -> Jaeger / Prometheus / Grafana |
       |                Object Storage (MinIO local / S3 / Azure Blob) |
       |                CI/CD Evals (Vitest + Promptfoo)               |
       +---------------------------------------------------------------+