/** The commit the app was built from, set by vite.main.config.mts. */
declare const BUILD_COMMIT: string
/** Which build this is ('release', 'e2e' or 'dev'), set by vite.main.config.mts from Vite's mode and APP_BUILD. */
declare const BUILD_FLAVOUR: 'release' | 'e2e' | 'dev'
