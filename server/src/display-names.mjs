/**
 * MediaSFU identifies a participant by display name within a room and refuses
 * a second join under a name that is already present, comparing names without
 * regard to letter case. In a two-person call that means a callee who picked
 * the caller's name cannot answer: the join is refused after they press Accept.
 *
 * The backend therefore checks the name before asking MediaSFU, and refuses
 * with a message the person can act on. It does not rename them: every client
 * connects with its own saved display name, so a name changed here would not
 * match the name the client joins with.
 */

/** True when two display names would be the same participant in one room. */
export function sameParticipantName(left, right) {
  const a = String(left || '').trim().toLowerCase();
  const b = String(right || '').trim().toLowerCase();
  return Boolean(a) && a === b;
}

/**
 * The message for a callee whose name matches the caller's. Returned rather
 * than thrown so each caller keeps its own error helper and status code.
 */
export function duplicateNameMessage(hostDisplayName) {
  return `Your display name matches the caller's ("${hostDisplayName}"). `
    + 'Change your display name to join this call.';
}

/** True when this participant would join under the host's display name. */
export function collidesWithHost(session, userId, displayName) {
  return Boolean(session)
    && userId !== session.hostUserId
    && sameParticipantName(displayName, session.displayName);
}
