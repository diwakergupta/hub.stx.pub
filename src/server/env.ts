export function getStacksDataDir(): string | null {
  const dir = process.env.STACKS_DATA_DIR?.trim();
  return dir && dir.length > 0 ? dir : null;
}
