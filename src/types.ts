import { z } from 'zod';

// ============================================================================
// Input Types
// ============================================================================

export const DependencySchema = z.object({
  ecosystem: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  license: z.string().optional(),
});

export type Dependency = z.infer<typeof DependencySchema>;

export const SbomFormatSchema = z.enum(['cyclonedx', 'spdx']);
export type SbomFormat = z.infer<typeof SbomFormatSchema>;

// ============================================================================
// CycloneDX 1.5 Types (Minimal)
// ============================================================================

export interface CycloneDxTool {
  vendor?: string;
  name: string;
  version?: string;
}

export interface CycloneDxMetadata {
  timestamp: string;
  tools?: CycloneDxTool[];
}

export interface CycloneDxComponent {
  type: 'library' | 'application' | 'framework' | 'file' | 'container' | 'device';
  name: string;
  version: string;
  purl?: string;
  licenses?: Array<{ license: { id?: string; name?: string } }>;
  'bom-ref'?: string;
}

export interface CycloneDxSbom {
  bomFormat: 'CycloneDX';
  specVersion: '1.5';
  version: number;
  serialNumber?: string;
  metadata: CycloneDxMetadata;
  components: CycloneDxComponent[];
}

// ============================================================================
// SPDX 2.3 Types (Minimal)
// ============================================================================

export interface SpdxCreationInfo {
  created: string;
  creators: string[];
}

export interface SpdxPackage {
  name: string;
  SPDXID: string;
  downloadLocation: string;
  versionInfo: string;
  licenseConcluded?: string;
  licenseDeclared?: string;
  filesAnalyzed?: boolean;
  externalRefs?: Array<{
    referenceCategory: string;
    referenceType: string;
    referenceLocator: string;
  }>;
}

export interface SpdxSbom {
  spdxVersion: 'SPDX-2.3';
  dataLicense: 'CC0-1.0';
  SPDXID: 'SPDXRef-DOCUMENT';
  name: string;
  documentNamespace: string;
  creationInfo: SpdxCreationInfo;
  packages: SpdxPackage[];
}

// ============================================================================
// Union SBOM Type
// ============================================================================

export type Sbom = CycloneDxSbom | SpdxSbom;

export function isCycloneDxSbom(sbom: Sbom): sbom is CycloneDxSbom {
  return 'bomFormat' in sbom && sbom.bomFormat === 'CycloneDX';
}

export function isSpdxSbom(sbom: Sbom): sbom is SpdxSbom {
  return 'spdxVersion' in sbom && sbom.spdxVersion === 'SPDX-2.3';
}

// ============================================================================
// Diff Types
// ============================================================================

export interface ComponentDiff {
  name: string;
  ecosystem?: string;
  purl?: string;
  oldVersion?: string;
  newVersion?: string;
}

export interface SbomDiffResult {
  added: ComponentDiff[];
  removed: ComponentDiff[];
  version_changed: ComponentDiff[];
}

// ============================================================================
// Response Envelope Types
// ============================================================================

export interface ResponseMeta {
  source?: string;
  retrieved_at: string;
  pagination?: { next_cursor: string | null };
  warnings?: string[];
}

export interface SuccessResponse<T> {
  ok: true;
  data: T;
  meta: ResponseMeta;
}

export type ErrorCode =
  | 'INVALID_INPUT'
  | 'UPSTREAM_ERROR'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'PARSE_ERROR'
  | 'INTERNAL_ERROR';

export interface ErrorResponse {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ResponseMeta;
}

export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// Tool Input Schemas (for MCP)
// ============================================================================

export const SbomFromDependenciesInputSchema = z.object({
  deps: z.array(DependencySchema).min(1),
  format: SbomFormatSchema,
});

export type SbomFromDependenciesInput = z.infer<typeof SbomFromDependenciesInputSchema>;

export const CycloneDxSbomSchema = z.object({
  bomFormat: z.literal('CycloneDX'),
  specVersion: z.literal('1.5'),
  version: z.number(),
  serialNumber: z.string().optional(),
  metadata: z.object({
    timestamp: z.string(),
    tools: z.array(z.object({
      vendor: z.string().optional(),
      name: z.string(),
      version: z.string().optional(),
    })).optional(),
  }),
  components: z.array(z.object({
    type: z.enum(['library', 'application', 'framework', 'file', 'container', 'device']),
    name: z.string(),
    version: z.string(),
    purl: z.string().optional(),
    licenses: z.array(z.object({
      license: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
      }),
    })).optional(),
    'bom-ref': z.string().optional(),
  })),
});

export const SpdxSbomSchema = z.object({
  spdxVersion: z.literal('SPDX-2.3'),
  dataLicense: z.literal('CC0-1.0'),
  SPDXID: z.literal('SPDXRef-DOCUMENT'),
  name: z.string(),
  documentNamespace: z.string(),
  creationInfo: z.object({
    created: z.string(),
    creators: z.array(z.string()),
  }),
  packages: z.array(z.object({
    name: z.string(),
    SPDXID: z.string(),
    downloadLocation: z.string(),
    versionInfo: z.string(),
    licenseConcluded: z.string().optional(),
    licenseDeclared: z.string().optional(),
    filesAnalyzed: z.boolean().optional(),
    externalRefs: z.array(z.object({
      referenceCategory: z.string(),
      referenceType: z.string(),
      referenceLocator: z.string(),
    })).optional(),
  })),
});

export const SbomSchema = z.union([CycloneDxSbomSchema, SpdxSbomSchema]);

export const SbomMergeInputSchema = z.object({
  sboms: z.array(SbomSchema).min(1),
  format: SbomFormatSchema,
});

export type SbomMergeInput = z.infer<typeof SbomMergeInputSchema>;

export const SbomDiffInputSchema = z.object({
  old_sbom: SbomSchema,
  new_sbom: SbomSchema,
});

export type SbomDiffInput = z.infer<typeof SbomDiffInputSchema>;
