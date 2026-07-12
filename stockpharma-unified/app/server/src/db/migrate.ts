import { migrate } from './migrateInline.js';

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
