import { APP_NAME } from '@app/contract/app'

/**
 * The Windows AppUserModelID. Squirrel names the shortcuts' ID `com.squirrel.<name>.<exe>`, and the
 * Forge config uses APP_NAME for both, so the app sets the same one: Windows notifications need them to match.
 */
export const APP_USER_MODEL_ID = `com.squirrel.${APP_NAME}.${APP_NAME}`
