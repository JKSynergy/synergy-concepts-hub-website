// npm run phase2c:cred -- <admin|finance|staff|clientA|clientB>
// Puts that test account's password on the clipboard WITHOUT printing it, then clears the clipboard after 30 s.
// With no argument it lists the accounts (names, roles, e-mail addresses — never passwords).
// Reads only the git-ignored .phase2c-accounts.local.json written by phase2c:verify / phase2c:seed.
import { spawn } from "node:child_process";
import { loadAccounts, ACCOUNT_FILE } from "./phase2c-seed-test-accounts.mjs";
import { isMain } from "./phase2c-guard.mjs";

function clipboardCommand() {
  if (process.platform === "win32") return ["clip", []];
  if (process.platform === "darwin") return ["pbcopy", []];
  return ["xclip", ["-selection", "clipboard"]];
}

export function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    const [cmd, args] = clipboardCommand();
    const p = spawn(cmd, args, { stdio: ["pipe", "ignore", "ignore"], shell: false });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.stdin.end(text);
  });
}

export async function run({ name, file = ACCOUNT_FILE, copy = copyToClipboard, log = (s) => console.log(s), wait = (ms) => new Promise((r) => setTimeout(r, ms)), clearAfterMs = 30_000 } = {}) {
  const accounts = loadAccounts(file);
  const names = Object.keys(accounts);
  if (!names.length) { log(`No accounts found in ${file}. Run phase2c:verify (with the write gate) first.`); return 1; }
  if (!name) {
    for (const n of names) log(`${n.padEnd(8)} ${String(accounts[n].role).padEnd(8)} ${accounts[n].email}`);
    log("Usage: npm run phase2c:cred -- <name>   (copies the password to the clipboard; nothing is printed)");
    return 0;
  }
  const key = names.find((n) => n.toLowerCase() === name.toLowerCase());
  if (!key) { log(`Unknown account "${name}". Known: ${names.join(", ")}`); return 1; }
  try { await copy(accounts[key].password); }
  catch { log("Could not reach the clipboard. Open the git-ignored .phase2c-accounts.local.json locally instead (do not paste it anywhere)."); return 1; }
  log(`${key} (${accounts[key].role}) — sign in as ${accounts[key].email}`);
  log(`Password is on the clipboard. It will be cleared in ${Math.round(clearAfterMs / 1000)} s.`);
  await wait(clearAfterMs);
  try { await copy(" "); log("Clipboard cleared."); } catch { log("Could not clear the clipboard; copy something else over it."); }
  return 0;
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2];
  const code = await run({ name: arg });
  process.exit(code);
}
