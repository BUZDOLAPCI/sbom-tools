import { describe, it, expect, beforeEach } from 'vitest';
import { sbomFromDependencies, sbomMerge, sbomDiff } from '../../src/tools/index.js';
import type { Dependency, CycloneDxSbom, SpdxSbom } from '../../src/types.js';

describe('sbom_from_dependencies', () => {
  const testDeps: Dependency[] = [
    { ecosystem: 'npm', name: 'lodash', version: '4.17.21', license: 'MIT' },
    { ecosystem: 'npm', name: 'express', version: '4.18.2' },
    { ecosystem: 'pypi', name: 'requests', version: '2.31.0', license: 'Apache-2.0' },
  ];

  describe('CycloneDX format', () => {
    it('should create a valid CycloneDX 1.5 SBOM', () => {
      const result = sbomFromDependencies(testDeps, 'cyclonedx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as CycloneDxSbom;
      expect(sbom.bomFormat).toBe('CycloneDX');
      expect(sbom.specVersion).toBe('1.5');
      expect(sbom.version).toBe(1);
      expect(sbom.serialNumber).toMatch(/^urn:uuid:/);
      expect(sbom.metadata.timestamp).toBeDefined();
      expect(sbom.metadata.tools).toBeDefined();
      expect(sbom.components).toHaveLength(3);
    });

    it('should generate correct purls for components', () => {
      const result = sbomFromDependencies(testDeps, 'cyclonedx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as CycloneDxSbom;
      const lodashComponent = sbom.components.find((c) => c.name === 'lodash');
      expect(lodashComponent?.purl).toBe('pkg:npm/lodash@4.17.21');

      const requestsComponent = sbom.components.find((c) => c.name === 'requests');
      expect(requestsComponent?.purl).toBe('pkg:pypi/requests@2.31.0');
    });

    it('should include license information when provided', () => {
      const result = sbomFromDependencies(testDeps, 'cyclonedx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as CycloneDxSbom;
      const lodashComponent = sbom.components.find((c) => c.name === 'lodash');
      expect(lodashComponent?.licenses).toEqual([{ license: { id: 'MIT' } }]);

      const expressComponent = sbom.components.find((c) => c.name === 'express');
      expect(expressComponent?.licenses).toBeUndefined();
    });

    it('should set component type to library', () => {
      const result = sbomFromDependencies(testDeps, 'cyclonedx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as CycloneDxSbom;
      for (const component of sbom.components) {
        expect(component.type).toBe('library');
      }
    });
  });

  describe('SPDX format', () => {
    it('should create a valid SPDX 2.3 SBOM', () => {
      const result = sbomFromDependencies(testDeps, 'spdx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as SpdxSbom;
      expect(sbom.spdxVersion).toBe('SPDX-2.3');
      expect(sbom.dataLicense).toBe('CC0-1.0');
      expect(sbom.SPDXID).toBe('SPDXRef-DOCUMENT');
      expect(sbom.documentNamespace).toMatch(/^https:\/\/spdx.org\/spdxdocs\//);
      expect(sbom.creationInfo.created).toBeDefined();
      expect(sbom.packages).toHaveLength(3);
    });

    it('should generate unique SPDX IDs for packages', () => {
      const result = sbomFromDependencies(testDeps, 'spdx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as SpdxSbom;
      const spdxIds = sbom.packages.map((p) => p.SPDXID);
      const uniqueIds = new Set(spdxIds);
      expect(uniqueIds.size).toBe(spdxIds.length);
    });

    it('should include purl in external refs', () => {
      const result = sbomFromDependencies(testDeps, 'spdx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as SpdxSbom;
      const lodashPkg = sbom.packages.find((p) => p.name === 'lodash');
      expect(lodashPkg?.externalRefs).toBeDefined();
      expect(lodashPkg?.externalRefs?.[0]).toEqual({
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: 'pkg:npm/lodash@4.17.21',
      });
    });

    it('should include license information when provided', () => {
      const result = sbomFromDependencies(testDeps, 'spdx');

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const sbom = result.data.sbom as SpdxSbom;
      const lodashPkg = sbom.packages.find((p) => p.name === 'lodash');
      expect(lodashPkg?.licenseConcluded).toBe('MIT');
      expect(lodashPkg?.licenseDeclared).toBe('MIT');

      const expressPkg = sbom.packages.find((p) => p.name === 'express');
      expect(expressPkg?.licenseConcluded).toBe('NOASSERTION');
    });
  });

  describe('response envelope', () => {
    it('should return proper success envelope', () => {
      const result = sbomFromDependencies(testDeps, 'cyclonedx');

      expect(result.ok).toBe(true);
      expect(result.meta.retrieved_at).toBeDefined();
      expect(result.meta.source).toBe('sbom-tools');
      expect(result.meta.pagination).toEqual({ next_cursor: null });
      expect(result.meta.warnings).toEqual([]);
    });
  });
});

describe('sbom_merge', () => {
  const cycloneDxSbom1: CycloneDxSbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { timestamp: '2024-01-01T00:00:00Z' },
    components: [
      { type: 'library', name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21' },
      { type: 'library', name: 'express', version: '4.18.2', purl: 'pkg:npm/express@4.18.2' },
    ],
  };

  const cycloneDxSbom2: CycloneDxSbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { timestamp: '2024-01-01T00:00:00Z' },
    components: [
      { type: 'library', name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21' },
      { type: 'library', name: 'axios', version: '1.6.0', purl: 'pkg:npm/axios@1.6.0' },
    ],
  };

  const spdxSbom: SpdxSbom = {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-DOCUMENT',
    name: 'Test SBOM',
    documentNamespace: 'https://spdx.org/spdxdocs/test',
    creationInfo: { created: '2024-01-01T00:00:00Z', creators: ['Tool: test'] },
    packages: [
      {
        name: 'requests',
        SPDXID: 'SPDXRef-Package-requests-0',
        downloadLocation: 'NOASSERTION',
        versionInfo: '2.31.0',
        externalRefs: [
          { referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: 'pkg:pypi/requests@2.31.0' },
        ],
      },
    ],
  };

  it('should merge multiple CycloneDX SBOMs', () => {
    const result = sbomMerge([cycloneDxSbom1, cycloneDxSbom2], 'cyclonedx');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sbom = result.data.sbom as CycloneDxSbom;
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.components).toHaveLength(3); // lodash deduplicated
  });

  it('should deduplicate components by name and version', () => {
    const result = sbomMerge([cycloneDxSbom1, cycloneDxSbom2], 'cyclonedx');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sbom = result.data.sbom as CycloneDxSbom;
    const lodashComponents = sbom.components.filter((c) => c.name === 'lodash');
    expect(lodashComponents).toHaveLength(1);
  });

  it('should merge SBOMs of different formats', () => {
    const result = sbomMerge([cycloneDxSbom1, spdxSbom], 'cyclonedx');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sbom = result.data.sbom as CycloneDxSbom;
    expect(sbom.components).toHaveLength(3); // lodash, express, requests
    const requestsComponent = sbom.components.find((c) => c.name === 'requests');
    expect(requestsComponent).toBeDefined();
    expect(requestsComponent?.version).toBe('2.31.0');
  });

  it('should output in SPDX format when requested', () => {
    const result = sbomMerge([cycloneDxSbom1, cycloneDxSbom2], 'spdx');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const sbom = result.data.sbom as SpdxSbom;
    expect(sbom.spdxVersion).toBe('SPDX-2.3');
    expect(sbom.packages).toHaveLength(3);
  });

  it('should return proper success envelope', () => {
    const result = sbomMerge([cycloneDxSbom1], 'cyclonedx');

    expect(result.ok).toBe(true);
    expect(result.meta.retrieved_at).toBeDefined();
    expect(result.meta.source).toBe('sbom-tools');
  });
});

describe('sbom_diff', () => {
  const oldSbom: CycloneDxSbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { timestamp: '2024-01-01T00:00:00Z' },
    components: [
      { type: 'library', name: 'lodash', version: '4.17.20', purl: 'pkg:npm/lodash@4.17.20' },
      { type: 'library', name: 'express', version: '4.18.2', purl: 'pkg:npm/express@4.18.2' },
      { type: 'library', name: 'moment', version: '2.29.4', purl: 'pkg:npm/moment@2.29.4' },
    ],
  };

  const newSbom: CycloneDxSbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { timestamp: '2024-01-02T00:00:00Z' },
    components: [
      { type: 'library', name: 'lodash', version: '4.17.21', purl: 'pkg:npm/lodash@4.17.21' },
      { type: 'library', name: 'express', version: '4.18.2', purl: 'pkg:npm/express@4.18.2' },
      { type: 'library', name: 'axios', version: '1.6.0', purl: 'pkg:npm/axios@1.6.0' },
    ],
  };

  it('should detect added components', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.added).toHaveLength(1);
    expect(result.data.added[0].name).toBe('axios');
    expect(result.data.added[0].newVersion).toBe('1.6.0');
  });

  it('should detect removed components', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.removed).toHaveLength(1);
    expect(result.data.removed[0].name).toBe('moment');
    expect(result.data.removed[0].oldVersion).toBe('2.29.4');
  });

  it('should detect version changes', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.version_changed).toHaveLength(1);
    expect(result.data.version_changed[0].name).toBe('lodash');
    expect(result.data.version_changed[0].oldVersion).toBe('4.17.20');
    expect(result.data.version_changed[0].newVersion).toBe('4.17.21');
  });

  it('should not report unchanged components', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const allNames = [
      ...result.data.added.map((c) => c.name),
      ...result.data.removed.map((c) => c.name),
      ...result.data.version_changed.map((c) => c.name),
    ];
    expect(allNames).not.toContain('express');
  });

  it('should include ecosystem information from purl', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.added[0].ecosystem).toBe('npm');
    expect(result.data.removed[0].ecosystem).toBe('npm');
    expect(result.data.version_changed[0].ecosystem).toBe('npm');
  });

  it('should work with SPDX SBOMs', () => {
    const oldSpdx: SpdxSbom = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: 'Old SBOM',
      documentNamespace: 'https://spdx.org/spdxdocs/old',
      creationInfo: { created: '2024-01-01T00:00:00Z', creators: ['Tool: test'] },
      packages: [
        { name: 'requests', SPDXID: 'SPDXRef-Package-requests', downloadLocation: 'NOASSERTION', versionInfo: '2.30.0' },
      ],
    };

    const newSpdx: SpdxSbom = {
      spdxVersion: 'SPDX-2.3',
      dataLicense: 'CC0-1.0',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: 'New SBOM',
      documentNamespace: 'https://spdx.org/spdxdocs/new',
      creationInfo: { created: '2024-01-02T00:00:00Z', creators: ['Tool: test'] },
      packages: [
        { name: 'requests', SPDXID: 'SPDXRef-Package-requests', downloadLocation: 'NOASSERTION', versionInfo: '2.31.0' },
      ],
    };

    const result = sbomDiff(oldSpdx, newSpdx);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.added).toHaveLength(0);
    expect(result.data.removed).toHaveLength(0);
    expect(result.data.version_changed).toHaveLength(1);
    expect(result.data.version_changed[0].name).toBe('requests');
  });

  it('should return empty arrays when SBOMs are identical', () => {
    const result = sbomDiff(oldSbom, oldSbom);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.added).toHaveLength(0);
    expect(result.data.removed).toHaveLength(0);
    expect(result.data.version_changed).toHaveLength(0);
  });

  it('should return proper success envelope', () => {
    const result = sbomDiff(oldSbom, newSbom);

    expect(result.ok).toBe(true);
    expect(result.meta.retrieved_at).toBeDefined();
    expect(result.meta.source).toBe('sbom-tools');
  });
});
