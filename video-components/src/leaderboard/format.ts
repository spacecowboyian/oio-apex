/** "Ian Jennings" -> "Ian J." — display only; matching (featured names, etc.) always uses the full name. */
export const displayName = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}.`;
};
