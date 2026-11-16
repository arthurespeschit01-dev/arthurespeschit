import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
export async function verifyInvitedAccess(db, owner) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261116142008_invited_workspace_access.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const as = async (id) => {
    await db.exec("reset role;set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  await as(owner);
  assert.equal(
    (await db.query("select agency_central_access() a")).rows[0].a,
    true,
  );
  const a = (
    await db.query("select agency_workspace_create('Destinada','') id")
  ).rows[0].id;
  const b = (
    await db.query("select agency_workspace_create('Não autorizada','') id")
  ).rows[0].id;
  const token = (
    await db.query(
      "insert into agency_workspace_invitations(workspace_id,email,role) values($1,'invited@example.invalid','viewer') returning token",
      [a],
    )
  ).rows[0].token;
  await db.exec("reset role");
  const employee = randomUUID();
  await db.query(
    "insert into auth.users(id,email,raw_user_meta_data) values($1,'invited@example.invalid','{\"central_allowed\":true}')",
    [employee],
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from organizations where owner_user_id=$1",
        [employee],
      )
    ).rows[0].n,
    0,
    "invited signup must not create agency",
  );
  await as(employee);
  let access = (await db.query("select agency_login_access() a")).rows[0].a;
  assert.equal(access.central_allowed, false);
  assert.equal(access.invitation_path, "/convite-equipe/" + token);
  assert.deepEqual(access.workspaces, []);
  await db.query("select agency_workspace_accept_invite($1)", [token]);
  access = (await db.query("select agency_login_access() a")).rows[0].a;
  assert.deepEqual(
    access.workspaces.map((w) => w.id),
    [a],
  );
  assert.equal(
    (await db.query("select count(*)::int n from agency_client_workspaces"))
      .rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from agency_client_workspaces where id=$1",
        [b],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (await db.query("select count(*)::int n from clients")).rows[0].n,
    0,
  );
  await assert.rejects(
    db.query("insert into clients(user_id,name) values($1,'Forbidden')", [
      employee,
    ]),
    /row-level security/,
  );
  await assert.rejects(
    db.query("select agency_workspace_create('Forbidden','')"),
    /exclusivo/,
  );
  await assert.rejects(
    db.query("select agency_account_workspace()"),
    /exclusivo/,
  );
  await assert.rejects(
    db.query(
      "delete from agency_private.workspace_only_users where user_id=$1",
      [employee],
    ),
    /permission denied/,
  );
  if (process.env.ACCOUNT_BROWSER) {
    const { verifyAgencyBrowser } = await import(
      "./agency-account-browser.mjs"
    );
    await verifyAgencyBrowser(db, employee, a, true, b);
  }
  await as(owner);
  await db.query("select agency_workspace_manage_member($1,$2,null)", [
    a,
    employee,
  ]);
  await as(employee);
  access = (await db.query("select agency_login_access() a")).rows[0].a;
  assert.equal(access.central_allowed, false);
  assert.deepEqual(access.workspaces, []);
  assert.equal(access.invitation_path, null);
  await db.exec("reset role");
  const normal = randomUUID();
  await db.query(
    "insert into auth.users(id,email) values($1,'normal@example.invalid')",
    [normal],
  );
  await as(normal);
  assert.equal(
    (await db.query("select agency_central_access() a")).rows[0].a,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from organizations where owner_user_id=$1",
        [normal],
      )
    ).rows[0].n,
    1,
  );
  console.log(
    "PASS invited login: no agency provisioning, no Central API/data, only designated workspace, unauthorized URL data denied, revocation stays restricted, metadata spoof denied, normal owners unchanged",
  );
}
