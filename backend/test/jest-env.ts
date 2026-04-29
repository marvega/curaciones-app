import * as path from 'path';
import * as dotenv from 'dotenv';

// Load .env.test before any module (especially AppModule + TypeORM) reads
// process.env. setupFiles runs before module imports happen in the spec files.
dotenv.config({ path: path.resolve(__dirname, '../.env.test') });
