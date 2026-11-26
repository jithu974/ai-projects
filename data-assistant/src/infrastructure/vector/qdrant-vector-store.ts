import type { QdrantClient } from '@qdrant/js-client-rest';
import type {
  IVectorStore,
  VectorChunkPayload,
  VectorRecord,
  VectorSearchFilter,
  VectorSearchHit,
} from '../../domain/vector-store.js';

export const DENSE_VECTOR_NAME = 'dense';

export function buildPhysicalCollectionName(
  prefix: string,
  modelName: string,
  dimensions: number,
): string {
  const slug = modelName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${prefix}_${slug}_${dimensions}`;
}

export function buildQdrantFilter(filter: VectorSearchFilter) {
  const must: Record<string, unknown>[] = [
    // Mandatory tenant isolation boundary on EVERY vector query
    { key: 'tenant_id', match: { value: filter.tenantId } },
  ];

  if (!filter.includeInactive) {
    must.push({ key: 'is_active', match: { value: true } });
  }
  if (filter.documentIds && filter.documentIds.length > 0) {
    must.push({ key: 'document_id', match: { any: [...filter.documentIds] } });
  }
  if (filter.mimeTypes && filter.mimeTypes.length > 0) {
    must.push({ key: 'mime_type', match: { any: [...filter.mimeTypes] } });
  }
  if (filter.chunkTypes && filter.chunkTypes.length > 0) {
    must.push({ key: 'chunk_type', match: { any: [...filter.chunkTypes] } });
  }

  return { must };
}

export class QdrantVectorStore implements IVectorStore {
  constructor(
    private readonly client: QdrantClient,
    private readonly collectionAlias: string,
    private readonly collectionPrefix: string,
  ) {}

  async ensureReady(modelName: string, dimensions: number): Promise<string> {
    const physicalName = buildPhysicalCollectionName(
      this.collectionPrefix,
      modelName,
      dimensions,
    );

    const { collections } = await this.client.getCollections();
    const physicalExists = collections.some((c) => c.name === physicalName);

    if (!physicalExists) {
      await this.client.createCollection(physicalName, {
        vectors: {
          [DENSE_VECTOR_NAME]: {
            size: dimensions,
            distance: 'Cosine',
          },
        },
        // Tune HNSW for filtered multi-tenant workloads
        hnsw_config: {
          m: 16,
          ef_construct: 100,
          payload_m: 16,
        },
      });

      // Required payload indexes for fast & strict RBAC/metadata pre-filtering
      await this.client.createPayloadIndex(physicalName, {
        field_name: 'tenant_id',
        field_schema: { type: 'keyword', is_tenant: true },
        wait: true,
      });
      for (const field of ['document_id', 'version_id', 'mime_type', 'chunk_type']) {
        await this.client.createPayloadIndex(physicalName, {
          field_name: field,
          field_schema: 'keyword',
          wait: true,
        });
      }
      await this.client.createPayloadIndex(physicalName, {
        field_name: 'is_active',
        field_schema: 'bool',
        wait: true,
      });
    }

    // Check existing live alias to guard against silent embedding model/dimension drift
    const aliasesRes = await this.client.getAliases();
    const existingAlias = aliasesRes.aliases.find((a) => a.alias_name === this.collectionAlias);

    if (!existingAlias) {
      await this.client.updateCollectionAliases({
        actions: [
          {
            create_alias: {
              collection_name: physicalName,
              alias_name: this.collectionAlias,
            },
          },
        ],
      });
      return physicalName;
    }

    if (existingAlias.collection_name !== physicalName) {
      throw new Error(
        `Embedding model mismatch: alias "${this.collectionAlias}" currently points to ` +
          `"${existingAlias.collection_name}", but configured model expects "${physicalName}". ` +
          `Re-index into "${physicalName}" and swap the alias explicitly to avoid mixed vector spaces.`,
      );
    }

    return physicalName;
  }

  async upsertChunks(records: readonly VectorRecord[]): Promise<void> {
    if (records.length === 0) return;

    const batchSize = 64;
    for (let i = 0; i < records.length; i += batchSize) {
      const slice = records.slice(i, i + batchSize);
      await this.client.upsert(this.collectionAlias, {
        wait: true,
        points: slice.map((r) => ({
          id: r.id,
          vector: { [DENSE_VECTOR_NAME]: r.denseVector },
          payload: r.payload as unknown as Record<string, unknown>,
        })),
      });
    }
  }

  async deleteByVersionId(tenantId: string, versionId: string): Promise<void> {
    await this.client.delete(this.collectionAlias, {
      wait: true,
      filter: {
        must: [
          { key: 'tenant_id', match: { value: tenantId } },
          { key: 'version_id', match: { value: versionId } },
        ],
      },
    });
  }

  async search(params: {
    vector: readonly number[];
    filter: VectorSearchFilter;
    topK: number;
    scoreThreshold?: number | undefined;
  }): Promise<VectorSearchHit[]> {
    const { points } = await this.client.query(this.collectionAlias, {
      query: [...params.vector],
      using: DENSE_VECTOR_NAME,
      filter: buildQdrantFilter(params.filter),
      limit: params.topK,
      with_payload: true,
      ...(params.scoreThreshold !== undefined ? { score_threshold: params.scoreThreshold } : {}),
    });

    return points.map((point) => ({
      chunkId: String(point.id),
      score: point.score,
      payload: point.payload as unknown as VectorChunkPayload,
    }));
  }
}