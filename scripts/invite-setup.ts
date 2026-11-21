// Sets who may invite people and the code that opens /signup (migration 0024). Neither value belongs in this
// repo: they are given here and kept in the database (the code only as a hash).
//   npm run invite-setup -- --owner you@example.com --code 'the code'
//   npm run invite-setup -- --remove someone@mailinator.com   (deletes a test account)
// Either flag on its own works. --code replaces every earlier code; --owner replaces every earlier owner.
import { createHash } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!, key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set");
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
const call = async (method: string, path: string, body?: unknown) => {
  const r = await fetch(url + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]}: ${r.status} ${await r.text()}`);
  return r;
};

// --remove <email>: deletes a test account made while trying sign-up. Mailinator addresses only, like the seeds
const remove = arg("remove")?.trim().toLowerCase();
if (remove) {
  if (!remove.endsWith("@mailinator.com")) throw new Error("--remove only deletes @mailinator.com test accounts");
  const users = ((await (await call("GET", "/auth/v1/admin/users?per_page=1000")).json()) as { users: { id: string; email?: string }[] }).users;
  const user = users.find((u) => u.email?.toLowerCase() === remove);
  if (!user) throw new Error("No account with that email");
  await call("DELETE", `/auth/v1/admin/users/${user.id}`);
  console.log("Test account removed.");
  process.exit(0);
}
// --link <email>: prints an invite link for a test address, the same kind the owner gets in Settings (to try /join)
const link = arg("link")?.trim().toLowerCase();
if (link) {
  if (!link.endsWith("@mailinator.com")) throw new Error("--link only makes links for @mailinator.com test accounts");
  const r = await fetch(`${url}/auth/v1/admin/generate_link`, { method: "POST", headers, body: JSON.stringify({ type: "invite", email: link }) });
  const made = (await r.json()) as { hashed_token?: string; msg?: string };
  if (!r.ok || !made.hashed_token) throw new Error(`no link: ${r.status} ${made.msg ?? ""}`);
  console.log(`/join?token_hash=${made.hashed_token}&type=invite`);
  process.exit(0);
}
const owner = arg("owner")?.trim().toLowerCase();
const code = arg("code");
if (!owner && !code) throw new Error("Give --owner <email> and/or --code <invite code>");
if (owner) {
  const users = ((await (await call("GET", "/auth/v1/admin/users?per_page=1000")).json()) as { users: { id: string; email?: string }[] }).users;
  const user = users.find((u) => u.email?.toLowerCase() === owner);
  if (!user) throw new Error("No account with that email");
  await call("DELETE", `/rest/v1/app_owners?user_id=neq.${user.id}`);
  await call("POST", "/rest/v1/app_owners?on_conflict=user_id", { user_id: user.id });
  console.log("Owner set: that account can invite people from Settings.");
}
if (code) {
  if (code.trim().length < 6) throw new Error("Use a code of at least 6 characters");
  const code_hash = createHash("sha256").update(code.trim()).digest("hex");
  await call("DELETE", `/rest/v1/invite_codes?code_hash=neq.${code_hash}`);
  await fetch(`${url}/rest/v1/invite_codes?on_conflict=code_hash`, { method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ code_hash }) }).then((r) => {
    if (!r.ok) throw new Error(`saving the code: ${r.status}`);
  });
  console.log("Invite code set (stored as a hash). Earlier codes no longer work.");
}
