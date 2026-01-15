import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config.js';
import type {
  Dependency,
  SbomFormat,
  CycloneDxSbom,
  SpdxSbom,
  Sbom,
  ApiResponse,
} from '../types.js';

/**
 * Generate a Package URL (purl) from dependency info
 * @see https://github.com/package-url/purl-spec
 */
function generatePurl(dep: Dependency): string {
  const ecosystem = dep.ecosystem.toLowerCase();
  const name = encodeURIComponent(dep.name);
  const version = encodeURIComponent(dep.version);
  return `pkg:${ecosystem}/${name}@${version}`;
}

/**
 * Sanitize a string for use in SPDX identifiers
 */
function sanitizeSpdxId(input: string): string {
  return input.replace(/[^a-zA-Z0-9.-]/g, '-');
}

/**
 * Create a CycloneDX 1.5 SBOM from dependencies
 */
function createCycloneDxSbom(deps: Dependency[]): CycloneDxSbom {
  const config = getConfig();
  const timestamp = new Date().toISOString();

  return {
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
    components: deps.map((dep) => {
      const component: CycloneDxSbom['components'][0] = {
        type: 'library',
        name: dep.name,
        version: dep.version,
        purl: generatePurl(dep),
        'bom-ref': `${dep.ecosystem}:${dep.name}@${dep.version}`,
      };

      if (dep.license) {
        component.licenses = [
          {
            license: {
              id: dep.license,
            },
          },
        ];
      }

      return component;
    }),
  };
}

/**
 * Create an SPDX 2.3 SBOM from dependencies
 */
function createSpdxSbom(deps: Dependency[]): SpdxSbom {
  const config = getConfig();
  const timestamp = new Date().toISOString();
  const documentUuid = uuidv4();

  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'Generated SBOM',
    documentNamespace: `https://spdx.org/spdxdocs/${documentUuid}`,
    creationInfo: {
      created: timestamp,
      creators: [`Tool: ${config.TOOL_VENDOR}/${config.TOOL_NAME}-${config.SERVER_VERSION}`],
    },
    packages: deps.map((dep, index) => {
      const spdxId = `SPDXRef-Package-${sanitizeSpdxId(dep.name)}-${index}`;
      const purl = generatePurl(dep);

      const pkg: SpdxSbom['packages'][0] = {
        name: dep.name,
        SPDXID: spdxId,
        downloadLocation: 'NOASSERTION',
        versionInfo: dep.version,
        filesAnalyzed: false,
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: purl,
          },
        ],
      };

      if (dep.license) {
        pkg.licenseConcluded = dep.license;
        pkg.licenseDeclared = dep.license;
      } else {
        pkg.licenseConcluded = 'NOASSERTION';
        pkg.licenseDeclared = 'NOASSERTION';
      }

      return pkg;
    }),
  };
}

/**
 * Create an SBOM from a list of dependencies
 */
export function sbomFromDependencies(
  deps: Dependency[],
  format: SbomFormat
): ApiResponse<{ sbom: Sbom }> {
  const timestamp = new Date().toISOString();

  try {
    let sbom: Sbom;

    if (format === 'cyclonedx') {
      sbom = createCycloneDxSbom(deps);
    } else {
      sbom = createSpdxSbom(deps);
    }

    return {
      ok: true,
      data: { sbom },
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
        message: `Failed to create SBOM: ${message}`,
        details: {},
      },
      meta: {
        retrieved_at: timestamp,
      },
    };
  }
}
