# sbom-tools

MCP server for creating, merging, and diffing SBOMs (Software Bill of Materials). Supports CycloneDX 1.5 and SPDX 2.3 formats.

## Features

- **sbom_from_dependencies**: Create SBOMs from dependency lists
- **sbom_merge**: Merge multiple SBOMs with deduplication
- **sbom_diff**: Compare SBOMs to find added, removed, and changed components

## Installation

```bash
npm install
npm run build
```

## Usage

### As MCP Server (stdio)

```bash
npm start
```

Or with npx:

```bash
npx sbom-tools
```

### As MCP Server (HTTP)

```bash
npm start -- --transport=http
```

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "sbom-tools": {
      "command": "node",
      "args": ["/path/to/sbom-tools/dist/cli.js"]
    }
  }
}
```

## Tools

### sbom_from_dependencies

Create an SBOM from a list of dependencies.

**Input:**
```json
{
  "deps": [
    {
      "ecosystem": "npm",
      "name": "lodash",
      "version": "4.17.21",
      "license": "MIT"
    },
    {
      "ecosystem": "pypi",
      "name": "requests",
      "version": "2.31.0"
    }
  ],
  "format": "cyclonedx"
}
```

**Output (CycloneDX):**
```json
{
  "ok": true,
  "data": {
    "sbom": {
      "bomFormat": "CycloneDX",
      "specVersion": "1.5",
      "version": 1,
      "serialNumber": "urn:uuid:...",
      "metadata": {
        "timestamp": "2024-01-15T10:00:00.000Z",
        "tools": [{"vendor": "Dedalus Labs", "name": "sbom-tools", "version": "1.0.0"}]
      },
      "components": [
        {
          "type": "library",
          "name": "lodash",
          "version": "4.17.21",
          "purl": "pkg:npm/lodash@4.17.21",
          "licenses": [{"license": {"id": "MIT"}}]
        },
        {
          "type": "library",
          "name": "requests",
          "version": "2.31.0",
          "purl": "pkg:pypi/requests@2.31.0"
        }
      ]
    }
  },
  "meta": {
    "source": "sbom-tools",
    "retrieved_at": "2024-01-15T10:00:00.000Z",
    "pagination": {"next_cursor": null},
    "warnings": []
  }
}
```

### sbom_merge

Merge multiple SBOMs into one, deduplicating components by name and version.

**Input:**
```json
{
  "sboms": [
    {"bomFormat": "CycloneDX", "specVersion": "1.5", ...},
    {"spdxVersion": "SPDX-2.3", ...}
  ],
  "format": "cyclonedx"
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "sbom": {
      "bomFormat": "CycloneDX",
      "specVersion": "1.5",
      "components": [...]
    }
  },
  "meta": {...}
}
```

### sbom_diff

Compare two SBOMs and return differences.

**Input:**
```json
{
  "old_sbom": {"bomFormat": "CycloneDX", ...},
  "new_sbom": {"bomFormat": "CycloneDX", ...}
}
```

**Output:**
```json
{
  "ok": true,
  "data": {
    "added": [
      {"name": "axios", "newVersion": "1.6.0", "ecosystem": "npm"}
    ],
    "removed": [
      {"name": "moment", "oldVersion": "2.29.4", "ecosystem": "npm"}
    ],
    "version_changed": [
      {"name": "lodash", "oldVersion": "4.17.20", "newVersion": "4.17.21", "ecosystem": "npm"}
    ]
  },
  "meta": {...}
}
```

## Response Envelope

All responses follow the standard Dedalus response envelope:

**Success:**
```json
{
  "ok": true,
  "data": {...},
  "meta": {
    "source": "sbom-tools",
    "retrieved_at": "ISO-8601 timestamp",
    "pagination": {"next_cursor": null},
    "warnings": []
  }
}
```

**Error:**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_INPUT | INTERNAL_ERROR | ...",
    "message": "Human readable message",
    "details": {}
  },
  "meta": {
    "retrieved_at": "ISO-8601 timestamp"
  }
}
```

## Supported Formats

### CycloneDX 1.5

Minimal schema focusing on components:
- `bomFormat`: "CycloneDX"
- `specVersion`: "1.5"
- `version`: 1
- `serialNumber`: UUID
- `metadata.timestamp`: ISO-8601
- `metadata.tools`: Tool info
- `components[]`: Library components with name, version, purl, licenses

### SPDX 2.3

Minimal schema focusing on packages:
- `spdxVersion`: "SPDX-2.3"
- `dataLicense`: "CC0-1.0"
- `SPDXID`: "SPDXRef-DOCUMENT"
- `documentNamespace`: Unique URI
- `creationInfo`: Timestamp and creators
- `packages[]`: Packages with name, version, SPDXID, licenses, external refs

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Type check
npm run typecheck
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_NAME` | `sbom-tools` | MCP server name |
| `SERVER_VERSION` | `1.0.0` | Server version |
| `TRANSPORT` | `stdio` | Transport type (`stdio` or `http`) |
| `HTTP_PORT` | `3000` | HTTP server port |
| `HTTP_HOST` | `127.0.0.1` | HTTP server host |
| `LOG_LEVEL` | `info` | Logging level |
| `TOOL_VENDOR` | `Dedalus Labs` | Tool vendor in SBOM metadata |
| `TOOL_NAME` | `sbom-tools` | Tool name in SBOM metadata |

## License

MIT
