import { z } from 'zod';

const ConfigSchema = z.object({
  // Server configuration
  SERVER_NAME: z.string().default('sbom-tools'),
  SERVER_VERSION: z.string().default('1.0.0'),

  // HTTP configuration (always HTTP transport)
  HTTP_PORT: z.coerce.number().int().positive().default(8080),
  HTTP_HOST: z.string().default('127.0.0.1'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Tool metadata
  TOOL_VENDOR: z.string().default('Dedalus Labs'),
  TOOL_NAME: z.string().default('sbom-tools'),
});

export type Config = z.infer<typeof ConfigSchema>;

function loadConfig(): Config {
  const env = {
    SERVER_NAME: process.env.SERVER_NAME,
    SERVER_VERSION: process.env.SERVER_VERSION,
    HTTP_PORT: process.env.HTTP_PORT,
    HTTP_HOST: process.env.HTTP_HOST,
    LOG_LEVEL: process.env.LOG_LEVEL,
    TOOL_VENDOR: process.env.TOOL_VENDOR,
    TOOL_NAME: process.env.TOOL_NAME,
  };

  return ConfigSchema.parse(env);
}

export const config = loadConfig();

export function getConfig(): Config {
  return config;
}
