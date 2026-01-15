import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config.js';
import type {
  Sbom,
  SbomFormat,
  CycloneDxSbom,
  SpdxSbom,
  CycloneDxComponent,
  SpdxPackage,
  ApiResponse,
} from '../types.js';
import {
  isCycloneDxSbom,
  isSpdxSbom,
} from '../types.js';

/**
 * Create a unique key for a component based on name and version
 */
function componentKey(name: string, version: string): string {
  return `${name}@${version}`;
}

/**
 * Sanitize a string for use in SPDX identifiers
 */
function sanitizeSpdxId(input: string): string {
  return input.replace(/[^a-zA-Z0-9.-]/g, '-');
}

/**
 * Extract components from a CycloneDX SBOM
 */
function extractCycloneDxComponents(sbom: CycloneDxSbom): Map<string, CycloneDxComponent> {
  const components = new Map<string, CycloneDxComponent>();
  for (const component of sbom.components) {
    const key = componentKey(component.name, component.version);
    if (!components.has(key)) {
      components.set(key, component);
    }
  }
  return components;
}

/**
 * Extract packages from an SPDX SBOM
 */
function extractSpdxPackages(sbom: SpdxSbom): Map<string, SpdxPackage> {
  const packages = new Map<string, SpdxPackage>();
  for (const pkg of sbom.packages) {
    const key = componentKey(pkg.name, pkg.versionInfo);
    if (!packages.has(key)) {
      packages.set(key, pkg);
    }
  }
  return packages;
}

/**
 * Convert a CycloneDX component to an SPDX package
 */
function cycloneDxToSpdxPackage(component: CycloneDxComponent, index: number): SpdxPackage {
  const spdxId = `SPDXRef-Package-${sanitizeSpdxId(component.name)}-${index}`;

  const pkg: SpdxPackage = {
    name: component.name,
    SPDXID: spdxId,
    downloadLocation: 'NOASSERTION',
    versionInfo: component.version,
    filesAnalyzed: false,
  };

  if (component.purl) {
    pkg.externalRefs = [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: component.purl,
      },
    ];
  }

  if (component.licenses && component.licenses.length > 0) {
    const license = component.licenses[0].license;
    const licenseId = license.id || license.name || 'NOASSERTION';
    pkg.licenseConcluded = licenseId;
    pkg.licenseDeclared = licenseId;
  } else {
    pkg.licenseConcluded = 'NOASSERTION';
    pkg.licenseDeclared = 'NOASSERTION';
  }

  return pkg;
}

/**
 * Convert an SPDX package to a CycloneDX component
 */
function spdxToCycloneDxComponent(pkg: SpdxPackage): CycloneDxComponent {
  const component: CycloneDxComponent = {
    type: 'library',
    name: pkg.name,
    version: pkg.versionInfo,
    'bom-ref': `${pkg.name}@${pkg.versionInfo}`,
  };

  // Extract purl from external refs if available
  const purlRef = pkg.externalRefs?.find(
    (ref) => ref.referenceType === 'purl'
  );
  if (purlRef) {
    component.purl = purlRef.referenceLocator;
  }

  // Convert license
  if (pkg.licenseDeclared && pkg.licenseDeclared !== 'NOASSERTION') {
    component.licenses = [
      {
        license: {
          id: pkg.licenseDeclared,
        },
      },
    ];
  }

  return component;
}

/**
 * Merge multiple SBOMs into one, deduplicating components
 */
export function sbomMerge(
  sboms: Sbom[],
  format: SbomFormat
): ApiResponse<{ sbom: Sbom }> {
  const timestamp = new Date().toISOString();
  const config = getConfig();

  try {
    if (sboms.length === 0) {
      return {
        ok: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'At least one SBOM is required for merging',
          details: {},
        },
        meta: {
          retrieved_at: timestamp,
        },
      };
    }

    // Collect all unique components
    const allCycloneDxComponents = new Map<string, CycloneDxComponent>();
    const allSpdxPackages = new Map<string, SpdxPackage>();

    for (const sbom of sboms) {
      if (isCycloneDxSbom(sbom)) {
        const components = extractCycloneDxComponents(sbom);
        for (const [key, component] of components) {
          if (!allCycloneDxComponents.has(key)) {
            allCycloneDxComponents.set(key, component);
          }
        }
      } else if (isSpdxSbom(sbom)) {
        const packages = extractSpdxPackages(sbom);
        for (const [key, pkg] of packages) {
          if (!allSpdxPackages.has(key)) {
            allSpdxPackages.set(key, pkg);
          }
        }
      }
    }

    // Convert between formats as needed and merge
    if (format === 'cyclonedx') {
      // Convert SPDX packages to CycloneDX components
      for (const [key, pkg] of allSpdxPackages) {
        if (!allCycloneDxComponents.has(key)) {
          allCycloneDxComponents.set(key, spdxToCycloneDxComponent(pkg));
        }
      }

      const mergedSbom: CycloneDxSbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        version: 1,
        serialNumber: `urn:uuid:${uuidv4()}`,
        metadata: {
          timestamp,
          tools: [
            {
              vendor: config.TOOL_VENDOR,
              name: config.TOOL_NAME,
              version: config.SERVER_VERSION,
            },
          ],
        },
        components: Array.from(allCycloneDxComponents.values()),
      };

      return {
        ok: true,
        data: { sbom: mergedSbom },
        meta: {
          source: 'sbom-tools',
          retrieved_at: timestamp,
          pagination: { next_cursor: null },
          warnings: [],
        },
      };
    } else {
      // Convert CycloneDX components to SPDX packages
      let index = allSpdxPackages.size;
      for (const [key, component] of allCycloneDxComponents) {
        if (!allSpdxPackages.has(key)) {
          allSpdxPackages.set(key, cycloneDxToSpdxPackage(component, index++));
        }
      }

      const documentUuid = uuidv4();
      const mergedSbom: SpdxSbom = {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: 'Merged SBOM',
        documentNamespace: `https://spdx.org/spdxdocs/${documentUuid}`,
        creationInfo: {
          created: timestamp,
          creators: [`Tool: ${config.TOOL_VENDOR}/${config.TOOL_NAME}-${config.SERVER_VERSION}`],
        },
        packages: Array.from(allSpdxPackages.values()),
      };

      return {
        ok: true,
        data: { sbom: mergedSbom },
        meta: {
          source: 'sbom-tools',
          retrieved_at: timestamp,
          pagination: { next_cursor: null },
          warnings: [],
        },
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: `Failed to merge SBOMs: ${message}`,
        details: {},
      },
      meta: {
        retrieved_at: timestamp,
      },
    };
  }
}
