import { resolve, sep } from "node:path";

import type { PersistedWorkspaceRecord } from "./workspace-registry.js";

// Maps a paseo-managed worktree workspace onto the process-env marker that lets
// a consumer distinguish "I am running inside a paseo worktree" from "I am
// running against the shared/default resource".
//
// Agents are launched with only PASEO_AGENT_CWD (their working directory); the
// daemon's service/terminal lifecycle instead exposes PASEO_WORKTREE_PATH for
// processes it spawns inside a worktree, and consumers gate per-worktree
// isolation on that variable (e.g. nidus-sync derives its replica database name
// from it). Without it an agent that shells out to a consumer's tooling is
// treated as running outside any worktree and falls back to the shared
// resource. This module projects the persisted worktree placement onto that
// same variable so agents inherit it, keyed off workspace ownership rather than
// directory heuristics.

/**
 * Returns the process-env markers for an agent running in a paseo-owned
 * worktree, or null when `workspace` is not a paseo-owned worktree (a source
 * checkout or a manual directory must keep running against the default
 * resource). Mirrors the non-port fields of `resolveWorktreeRuntimeEnv`
 * (`utils/worktree.ts`); the runtime worktree port is a service-routing concern
 * and is intentionally not propagated to agent processes.
 */
export function paseoWorktreeEnvForAgent(
  workspace: PersistedWorkspaceRecord,
): Record<string, string> | null {
  if (workspace.kind !== "worktree" || !workspace.isPaseoOwnedWorktree) {
    return null;
  }
  const worktreeRoot = workspace.worktreeRoot ?? workspace.cwd;
  const env: Record<string, string> = { PASEO_WORKTREE_PATH: worktreeRoot };
  if (workspace.mainRepoRoot) {
    // Source checkout is the original repo root shared across worktrees;
    // PASEO_ROOT_PATH is its backward-compatible alias.
    env.PASEO_SOURCE_CHECKOUT_PATH = workspace.mainRepoRoot;
    env.PASEO_ROOT_PATH = workspace.mainRepoRoot;
  }
  if (workspace.branch) {
    env.PASEO_BRANCH_NAME = workspace.branch;
  }
  return env;
}

/**
 * Finds the paseo-owned worktree whose root contains `cwd`. The agent's cwd may
 * be the worktree root itself or a subdirectory inside it; either way it is
 * operating against that worktree's isolated resources, so the enclosing
 * paseo-owned worktree wins. Returns null when `cwd` is not inside any
 * paseo-owned worktree.
 */
export function findPaseoOwnedWorktreeForCwd(
  workspaces: readonly PersistedWorkspaceRecord[],
  cwd: string,
): PersistedWorkspaceRecord | null {
  const resolvedCwd = resolve(cwd);
  let bestMatch: PersistedWorkspaceRecord | null = null;
  let bestRootLength = -1;
  for (const workspace of workspaces) {
    if (workspace.archivedAt) continue;
    if (workspace.kind !== "worktree" || !workspace.isPaseoOwnedWorktree) continue;
    const root = resolve(workspace.worktreeRoot ?? workspace.cwd);
    const isInside = resolvedCwd === root || resolvedCwd.startsWith(`${root}${sep}`);
    if (!isInside) continue;
    if (root.length > bestRootLength) {
      bestRootLength = root.length;
      bestMatch = workspace;
    }
  }
  return bestMatch;
}

/**
 * Resolves the worktree env markers to merge into an agent process about to be
 * launched under `cwd`, or null when `cwd` is not inside a paseo-owned
 * worktree.
 */
export async function resolveAgentWorktreeEnv(
  listWorkspaces: () => Promise<readonly PersistedWorkspaceRecord[]>,
  cwd: string,
): Promise<Record<string, string> | null> {
  const workspace = findPaseoOwnedWorktreeForCwd(await listWorkspaces(), cwd);
  return workspace ? paseoWorktreeEnvForAgent(workspace) : null;
}
