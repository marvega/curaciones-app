import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.test before any module (especially AppModule + TypeORM) reads
// process.env. setupFiles runs before module imports happen in the spec files.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });

// AppModule constructs ResendEmailService at boot, which throws when the
// API key is missing. The email module supports `EMAIL_BACKEND=noop` which
// disables the Resend client entirely — preferable to a dummy key because
// it short-circuits any accidental send attempt instead of silently failing
// inside the Resend SDK.
if (!process.env.EMAIL_BACKEND) {
  process.env.EMAIL_BACKEND = 'noop';
}
