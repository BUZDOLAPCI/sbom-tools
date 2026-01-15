import type {
  Sbom,
  CycloneDxSbom,
  SpdxSbom,
  SbomDiffResult,
  ComponentDiff,
  ApiResponse,
} from '../types.js';
import {
  isCycloneDxSbom,
  isSpdxSbom,
} from '../types.js';

interface NormalizedComponent {
  name: string;
  version: string;
  purl?: string;
  ecosystem?: string;
}

/**
 * Extract ecosystem from purl
 */
function extractEcosystemFromPurl(purl: string | undefined): string | undefined {
  if (!purl) return undefined;
  const match = purl.match(/^pkg:([^/]+)\//);
  return match ? match[1] : undefined;
}

/**
 * Normalize CycloneDX components for comparison
 */
function normalizeCycloneDxComponents(sbom: CycloneDxSbom): Map<string, NormalizedComponent> {
  const components = new Map<string, NormalizedComponent>();

  for (const component of sbom.components) {
    const normalized: NormalizedComponent = {
      name: component.name,
      version: component.version,
      purl: component.purl,
      ecosystem: extractEcosystemFromPurl(component.purl),
    };
    // Key by name only for diffing (to detect version changes)
    components.set(component.name, normalized);
  }

  return components;
}

/**
 * Normalize SPDX packages for comparison
 */
function normalizeSpdxPackages(sbom: SpdxSbom): Map<string, NormalizedComponent> {
  const components = new Map<string, NormalizedComponent>();

  for (const pkg of sbom.packages) {
    const purlRef = pkg.externalRefs?.find(
      (ref) => ref.referenceType === 'purl'
    );
    const purl = purlRef?.referenceLocator;

    const normalized: NormalizedComponent = {
      name: pkg.name,
      version: pkg.versionInfo,
      purl,
      ecosystem: extractEcosystemFromPurl(purl),
    };
    // Key by name only for diffing (to detect version changes)
    components.set(pkg.name, normalized);
  }

  return components;
}

/**
 * Normalize any SBOM format to a common structure for comparison
 */
function normalizeComponents(sbom: Sbom): Map<string, NormalizedComponent> {
  if (isCycloneDxSbom(sbom)) {
    return normalizeCycloneDxComponents(sbom);
  } else if (isSpdxSbom(sbom)) {
    return normalizeSpdxPackages(sbom);
  }
  return new Map();
}

/**
 * Compare two SBOMs and return differences
 */
export function sbomDiff(
  oldSbom: Sbom,
  newSbom: Sbom
): ApiResponse<SbomDiffResult> {
  const timestamp = new Date().toISOString();

  try {
    const oldComponents = normalizeComponents(oldSbom);
    const newComponents = normalizeComponents(newSbom);

    const added: ComponentDiff[] = [];
    const removed: ComponentDiff[] = [];
    const versionChanged: ComponentDiff[] = [];

    // Find added and version-changed components
    for (const [name, newComp] of newComponents) {
      const oldComp = oldComponents.get(name);

      if (!oldComp) {
        // Component is new
        added.push({
          name: newComp.name,
          ecosystem: newComp.ecosystem,
          purl: newComp.purl,
          newVersion: newComp.version,
        });
      } else if (oldComp.version !== newComp.version) {
        // Version changed
        versionChanged.push({
          name: newComp.name,
          ecosystem: newComp.ecosystem,
          purl: newComp.purl,
          oldVersion: oldComp.version,
          newVersion: newComp.version,
        });
      }
    }

    // Find removed components
    for (const [name, oldComp] of oldComponents) {
      if (!newComponents.has(name)) {
        removed.push({
          name: oldComp.name,
          ecosystem: oldComp.ecosystem,
          purl: oldComp.purl,
          oldVersion: oldComp.version,
        });
      }
    }

    // Sort all arrays by name for consistent output
    const sortByName = (a: ComponentDiff, b: ComponentDiff) =>
      a.name.localeCompare(b.name);

    added.sort(sortByName);
    removed.sort(sortByName);
    versionChanged.sort(sortByName);

    return {
      ok: true,
      data: {
        added,
        removed,
        version_changed: versionChanged,
      },
      meta: {
        source: 'sbom-tools',
        retrieved_at: timestamp,
        pagination: { next_cursor: null },
        warnings: [],
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `Failed to diff SBOMs: ${message}`,
        details: {},
      },
      meta: {
        retrieved_at: timestamp,
      },
    };
  }
}
