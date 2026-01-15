// Main exports for programmatic usage
export { createServer } from './server.js';
export { createStdioTransport, createHttpTransport } from './transport/index.js';
export { sbomFromDependencies, sbomMerge, sbomDiff } from './tools/index.js';
export { getConfig } from './config.js';
export type { Config } from './config.js';
export type {
  Dependency,
  SbomFormat,
  CycloneDxSbom,
  SpdxSbom,
  Sbom,
  SbomDiffResult,
  ComponentDiff,
  ApiResponse,
  SuccessResponse,
  ErrorResponse,
  ErrorCode,
  ResponseMeta,
} from './types.js';
