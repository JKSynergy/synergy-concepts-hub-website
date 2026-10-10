import { __from, __rpc } from "./p4-shim.mjs";

export function createAdminClient() {
  return { from: __from, rpc: __rpc };
}
