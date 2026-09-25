export function getStacksDataDir(): string | null {
  const dir = process.env.STACKS_DATA_DIR?.trim();
  return dir && dir.length > 0 ? dir : null;
}

export function getStacksNodeRpcUrl(): string {
  const url = process.env.STACKS_NODE_RPC_URL?.trim();
  return url && url.length > 0 ? url : "http://localhost:20443";
}
