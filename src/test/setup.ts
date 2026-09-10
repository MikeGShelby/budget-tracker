// IndexedDB has no implementation in jsdom, so the repository suites get a real
// in-memory one here. Loaded for every suite via `test.setupFiles` in
// vite.config.ts — keep this file to that single concern.
import 'fake-indexeddb/auto'
