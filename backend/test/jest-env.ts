import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.test before any module (especially AppModule + TypeORM) reads
// process.env. setupFiles runs before module imports happen in the spec files.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// AppModule constructs ResendEmailService at boot, which throws when the
// API key is missing. We never send mail during tests, so a placeholder
// keeps the DI graph happy — no need to add this to .env.test (which is
// gitignored and varies per developer).
if (!process.env.RESEND_API_KEY) {
  process.env.RESEND_API_KEY = 'test_dummy_resend_key';
}
