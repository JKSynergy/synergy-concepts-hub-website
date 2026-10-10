import { __from } from "./p4-shim.mjs";

let _user = null;
export function __setUser(u) { _user = u; }

export async function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: _user } }) },
    from: __from,
  };
}
