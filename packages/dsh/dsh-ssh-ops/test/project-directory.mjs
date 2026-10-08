import assert from "node:assert/strict";
import { profileInfoSchema, profileSaveRequestSchema } from "../src/schemas.js";
import { profileRecordSchema } from "../src/index.js";

// The save RPC and durable schema must agree after JSON serialization. In
// particular a cleared/unset project folder is persisted as null.
for (const project of [undefined, null, "/srv/app"]) {
  const persisted = JSON.parse(JSON.stringify({
    name: "saved resource", host: "192.0.2.1", port: 22, username: "ops",
    authKind: "key", groupId: null, defaultProjectPath: project,
    createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z"
  }));
  assert.deepEqual(profileRecordSchema.parse(persisted), persisted);
}

const identity = {
  name: "production app", host: "192.0.2.10", port: 22, username: "ops",
  authKind: "key", hostKeyMode: "accept-new"
};

assert.equal(profileSaveRequestSchema.parse({ ...identity, defaultProjectPath: "/srv/apps/api" }).defaultProjectPath, "/srv/apps/api");
assert.equal(profileSaveRequestSchema.parse({ ...identity, defaultProjectPath: null }).defaultProjectPath, null);
for (const path of ["relative/project", "/srv/app\nnext", ""]) {
  assert.equal(profileSaveRequestSchema.safeParse({ ...identity, defaultProjectPath: path }).success, false, `reject unsafe project path ${JSON.stringify(path)}`);
}

assert.equal(profileInfoSchema.parse({
  ...identity,
  profileId: "00000000-0000-4000-8000-000000000001",
  groupId: null, groupName: null, credentialConfigured: true, passphraseConfigured: false,
  connected: false, credentialId: null, credentialName: null, proxyJump: [],
  defaultProjectPath: "/srv/apps/api"
}).defaultProjectPath, "/srv/apps/api");
