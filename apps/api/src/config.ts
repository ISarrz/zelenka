const required = (key: string): string => {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: Number(optional('PORT', '8080')),
  databaseUrl: required('DATABASE_URL'),
  perenualDatabaseUrl: optional('PERENUAL_DATABASE_URL', ''),
  sessionTtlDays: Number(optional('SESSION_TTL_DAYS', '30')),
  magicLinkTtlMin: Number(optional('MAGIC_LINK_TTL_MIN', '15')),
  webBaseUrl: optional('WEB_BASE_URL', 'http://localhost:5173'),
  mailTransport: optional('MAIL_TRANSPORT', 'console'),
  plantIdApiKey: optional('PLANT_ID_API_KEY', ''),
  resendApiKey: optional('RESEND_API_KEY', ''),
  resendFrom: optional('RESEND_FROM', 'Zelenka <noreply@zelenka-api.ru>'),
  vapidPublicKey: optional('VAPID_PUBLIC_KEY', ''),
  vapidPrivateKey: optional('VAPID_PRIVATE_KEY', ''),
  vapidSubject: optional('VAPID_SUBJECT', 'mailto:admin@zelenka-api.ru'),
  speciesPhotosDir: optional('SPECIES_PHOTOS_DIR', '/photos'),
  perenualPhotosDir: optional('PERENUAL_PHOTOS_DIR', '/perenual-photos'),
};

export const isProd = config.env === 'production';
