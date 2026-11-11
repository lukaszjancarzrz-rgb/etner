import { swapRestored } from './restore-swap.js';

// Przed Litestream w startCommand (render.yaml): Litestream musi od razu czytać już podmienioną bazę.
if (swapRestored(process.env.DATA_DIR ?? './data')) console.log('Odtworzona baza (restore.db) podmieniona na etner.db.');
