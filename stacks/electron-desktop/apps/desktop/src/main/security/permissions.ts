import type { Session } from 'electron'

/** Denies every permission a page requests or checks (camera, notifications, clipboard...) on one session. */
export function denyAllPermissions(
  session: Pick<Session, 'setPermissionRequestHandler' | 'setPermissionCheckHandler'>,
): void {
  session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  session.setPermissionCheckHandler(() => false)
}
