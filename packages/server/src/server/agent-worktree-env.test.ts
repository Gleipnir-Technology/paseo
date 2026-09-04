import { join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  findPaseoOwnedWorktreeForCwd,
  paseoWorktreeEnvForAgent,
  resolveAgentWorktreeEnv,
} from "./agent-worktree-env.js";
import type { PersistedWorkspaceRecord } from "./workspace-registry.js";

const WORKTREE_ROOT = "/home/user/.paseo/worktrees/082txh3s/odd-eel";
const MAIN_REPO = "/home/user/src/nidus-sync";

function workspace(overrides: Partial<PersistedWorkspaceRecord>): PersistedWorkspaceRecord {
  return {
    workspaceId: "wks_test",
    projectId: "prj_test",
    cwd: WORKTREE_ROOT,
    kind: "worktree",
    displayName: "odd-eel",
    title: null,
    branch: "odd-eel",
    worktreeRoot: WORKTREE_ROOT,
    baseBranch: "main",
    isPaseoOwnedWorktree: true,
    mainRepoRoot: MAIN_REPO,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

describe("paseoWorktreeEnvForAgent", () => {
  test("returns worktree markers only for a paseo-owned worktree", () => {
    expect(paseoWorktreeEnvForAgent(workspace({}))).toEqual({
      PASEO_WORKTREE_PATH: WORKTREE_ROOT,
      PASEO_SOURCE_CHECKOUT_PATH: MAIN_REPO,
      PASEO_ROOT_PATH: MAIN_REPO,
      PASEO_BRANCH_NAME: "odd-eel",
    });
  });

  test("returns null for a source checkout (local_checkout)", () => {
    expect(
      paseoWorktreeEnvForAgent(workspace({ kind: "local_checkout", isPaseoOwnedWorktree: false })),
    ).toBeNull();
  });

  test("returns null for a worktree paseo does not own", () => {
    expect(paseoWorktreeEnvForAgent(workspace({ isPaseoOwnedWorktree: false }))).toBeNull();
  });

  test("falls back to cwd when worktreeRoot is absent", () => {
    const env = paseoWorktreeEnvForAgent(
      workspace({ worktreeRoot: null, mainRepoRoot: null, branch: null }),
    );
    expect(env).toEqual({ PASEO_WORKTREE_PATH: WORKTREE_ROOT });
  });
});

describe("findPaseoOwnedWorktreeForCwd", () => {
  const records = [
    workspace({ workspaceId: "wks_owned" }),
    workspace({
      workspaceId: "wks_checkout",
      kind: "local_checkout",
      isPaseoOwnedWorktree: false,
      cwd: "/home/user/src/nidus-sync",
    }),
  ];

  test("matches the worktree root exactly", () => {
    expect(findPaseoOwnedWorktreeForCwd(records, WORKTREE_ROOT)?.workspaceId).toBe("wks_owned");
  });

  test("matches a subdirectory inside the worktree", () => {
    expect(
      findPaseoOwnedWorktreeForCwd(records, join(WORKTREE_ROOT, "platform", "email"))?.workspaceId,
    ).toBe("wks_owned");
  });

  test("returns null for a path outside any paseo-owned worktree", () => {
    expect(findPaseoOwnedWorktreeForCwd(records, "/home/user/src/elsewhere")).toBeNull();
  });

  test("skips archived paseo-owned worktrees", () => {
    const archived = [workspace({ archivedAt: "2026-02-01T00:00:00.000Z" })];
    expect(findPaseoOwnedWorktreeForCwd(archived, WORKTREE_ROOT)).toBeNull();
  });
});

describe("resolveAgentWorktreeEnv", () => {
  test("projects env when cwd is inside a paseo-owned worktree", async () => {
    const env = await resolveAgentWorktreeEnv(
      async () => [workspace({})],
      join(WORKTREE_ROOT, "platform"),
    );
    expect(env?.PASEO_WORKTREE_PATH).toBe(WORKTREE_ROOT);
  });

  test("returns null when cwd is not inside a paseo-owned worktree", async () => {
    const env = await resolveAgentWorktreeEnv(
      async () => [workspace({ kind: "local_checkout", isPaseoOwnedWorktree: false })],
      "/home/user/src/nidus-sync",
    );
    expect(env).toBeNull();
  });
});
