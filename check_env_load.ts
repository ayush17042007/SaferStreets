import { loadEnv } from './apps/api/src/config/env.js';
const env = loadEnv();
console.log('OPEN', env.OPENROUTESERVICE_API_KEY ? 'present' : 'missing');
console.log('APP_ORIGIN', env.APP_ORIGIN);
console.log('API_ORIGIN', env.API_ORIGIN);
console.log('SESSION', env.SESSION_SECRET ? 'present' : 'missing');
console.log('OTP', env.OTP_HMAC_SECRET ? 'present' : 'missing');
