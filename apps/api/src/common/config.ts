export interface AppConfig {
  appDatabaseUrl: string;
  jwtSecret: string;
  fileStorageDir: string;
  simulateWhatsappOutage: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appDatabaseUrl = env.APP_DATABASE_URL;
  const jwtSecret = env.JWT_SECRET;
  if (!appDatabaseUrl) throw new Error('APP_DATABASE_URL is required');
  if (!jwtSecret || jwtSecret.length < 16) throw new Error('JWT_SECRET must be at least 16 characters');
  return {
    appDatabaseUrl,
    jwtSecret,
    fileStorageDir: env.FILE_STORAGE_DIR ?? './storage',
    simulateWhatsappOutage: env.SIMULATE_WHATSAPP_OUTAGE === 'true',
  };
}

export const CONFIG = Symbol('CONFIG');
export const DB = Symbol('DB');
