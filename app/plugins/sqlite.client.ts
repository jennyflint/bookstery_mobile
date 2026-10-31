import { defineNuxtPlugin } from '#app';
import { SqliteService } from '../services/database/SqliteService';

export default defineNuxtPlugin(async () => {
  const sqlite = SqliteService.getInstance();
  await sqlite.init();
});
