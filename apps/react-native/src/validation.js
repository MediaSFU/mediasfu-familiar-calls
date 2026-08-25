export const USER_ID_PATTERN = /^[A-Za-z0-9_-]{2,64}$/;
export const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9]{2,10}$/;

export function isValidUserId(value) {
  return USER_ID_PATTERN.test(value.trim());
}

export function isValidDisplayName(value) {
  return DISPLAY_NAME_PATTERN.test(value.trim());
}
