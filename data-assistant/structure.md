data-assistant/
├── docs/
│   ├── architecture.md
│   ├── technology-decisions.md
│   ├── data-model.md
│   ├── ingestion-design.md
│   ├── retrieval-design.md
│   ├── security-design.md
│   ├── implementation-roadmap.md
│   └── adrs/
│       ├── ADR-001-modular-monolith-python-sidecar.md
│       ├── ADR-002-custom-ts-rag-core.md
│       ├── ADR-003-postgres-qdrant-dual-store.md
│       └── ADR-004-retrieval-time-authorization.md
├── src/
│   ├── api/                # Fastify routes, DTOs, Zod schemas, error middleware
│   ├── application/        # Use-case orchestrators (UploadDoc, AskQuestion)
│   ├── domain/             # Pure entities, value objects, repository/provider interfaces
│   ├── infrastructure/     # Postgres (Drizzle), Qdrant, Redis/BullMQ, S3/MinIO, LLM SDKs
│   ├── ingestion/          # Parsers, cleaners, normalizers, chunkers, workers
│   ├── retrieval/          # Hybrid search, RRF fusion, query rewriting, reranking
│   ├── generation/         # Context builder, prompt templates, citation validator
│   ├── evaluation/         # Golden datasets, Promptfoo configs, retrieval metrics
│   ├── security/           # OIDC/JWT auth, RBAC/ABAC policy engine, guardrails
│   ├── observability/      # OpenTelemetry SDK, Pino logger, cost calculator
│   └── shared/             # Config validation, typed errors, retry/circuit breakers
├── services/
│   └── doc-parser/         # Python FastAPI + Docling sidecar + Dockerfile
├── tests/
│   ├── unit/
│   ├── integration/        # Testcontainers (Postgres, Redis, Qdrant)
│   ├── e2e/
│   └── security/           # Tenant isolation & prompt injection suites
├── docker/                 # Docker Compose + Prometheus/Grafana configs
└── .github/workflows/      # CI: lint, typecheck, unit/integration tests, Promptfoo