import { normalizePath, TFile, TFolder, Vault } from "obsidian";
import { getBlob, getTree, gitBlobSha, RepoConfig } from "./github";

export interface FolderMapping {
	/** Folder inside the repo, e.g. "templates". Empty = repo root. */
	remotePath: string;
	/** Folder inside the vault, e.g. "_templates". */
	localPath: string;
}

export type ChangeKind = "add" | "update" | "delete";

export interface Change {
	kind: ChangeKind;
	localPath: string;
	/** Remote blob sha (absent for deletes). */
	remoteSha?: string;
	/** True when the local file was edited since the last sync (would lose those edits). */
	locallyModified: boolean;
}

export interface SyncPlan {
	commitSha: string;
	changes: Change[];
	/** How many repo files fell inside a mapping (0 usually means a mapping typo). */
	matchedFiles: number;
	/** Folders in the repo, used to help diagnose mappings that match nothing. */
	repoFolders: string[];
}

/** localPath -> blob sha that was last written by the plugin. */
export type SyncedFiles = Record<string, string>;

function trimSlashes(p: string): string {
	return p.replace(/^\/+|\/+$/g, "");
}

function mapRemoteToLocal(remoteFile: string, mappings: FolderMapping[]): string | null {
	for (const m of mappings) {
		const remote = trimSlashes(m.remotePath);
		const local = trimSlashes(m.localPath);
		let rel: string | null = null;
		if (remote === "") rel = remoteFile;
		else if (remoteFile.startsWith(remote + "/")) rel = remoteFile.slice(remote.length + 1);
		if (rel !== null) return normalizePath(local ? `${local}/${rel}` : rel);
	}
	return null;
}

async function localSha(vault: Vault, path: string): Promise<string | null> {
	if (!(await vault.adapter.exists(path))) return null;
	return gitBlobSha(await vault.adapter.readBinary(path));
}

export async function buildPlan(
	vault: Vault,
	cfg: RepoConfig,
	commitSha: string,
	mappings: FolderMapping[],
	synced: SyncedFiles
): Promise<SyncPlan> {
	const tree = await getTree(cfg, commitSha);
	const changes: Change[] = [];
	const seen = new Set<string>();

	for (const entry of tree) {
		const localPath = mapRemoteToLocal(entry.path, mappings);
		if (!localPath || seen.has(localPath)) continue;
		seen.add(localPath);

		const current = await localSha(vault, localPath);
		if (current === entry.sha) continue; // already identical
		if (current === null) {
			changes.push({ kind: "add", localPath, remoteSha: entry.sha, locallyModified: false });
		} else {
			// Modified locally if it differs from what we last wrote (or we never wrote it).
			const lastWritten = synced[localPath];
			changes.push({
				kind: "update",
				localPath,
				remoteSha: entry.sha,
				locallyModified: lastWritten !== current,
			});
		}
	}

	// Files we previously synced that no longer exist in the repo.
	for (const [localPath, lastWritten] of Object.entries(synced)) {
		if (seen.has(localPath)) continue;
		const current = await localSha(vault, localPath);
		if (current === null) continue;
		changes.push({ kind: "delete", localPath, locallyModified: current !== lastWritten });
	}

	changes.sort((a, b) => a.localPath.localeCompare(b.localPath));

	const folders = new Set<string>();
	for (const e of tree) {
		const parts = e.path.split("/");
		for (let i = 1; i < parts.length && i <= 2; i++) folders.add(parts.slice(0, i).join("/"));
	}
	return { commitSha, changes, matchedFiles: seen.size, repoFolders: [...folders].sort() };
}

async function ensureFolder(vault: Vault, folderPath: string): Promise<void> {
	if (!folderPath || folderPath === "/") return;
	const existing = vault.getAbstractFileByPath(folderPath);
	if (existing instanceof TFolder) return;
	const parent = folderPath.includes("/") ? folderPath.slice(0, folderPath.lastIndexOf("/")) : "";
	await ensureFolder(vault, parent);
	if (!(await vault.adapter.exists(folderPath))) await vault.createFolder(folderPath);
}

/**
 * Applies the selected changes. Returns the updated SyncedFiles record.
 * Changes that fail are reported in `errors` and left out of the record update.
 */
export async function applyPlan(
	vault: Vault,
	cfg: RepoConfig,
	changes: Change[],
	synced: SyncedFiles
): Promise<{ synced: SyncedFiles; errors: string[] }> {
	const next: SyncedFiles = { ...synced };
	const errors: string[] = [];

	for (const c of changes) {
		try {
			if (c.kind === "delete") {
				const f = vault.getAbstractFileByPath(c.localPath);
				if (f instanceof TFile) await vault.trash(f, true);
				else if (await vault.adapter.exists(c.localPath)) await vault.adapter.trashSystem(c.localPath);
				delete next[c.localPath];
				continue;
			}
			const data = await getBlob(cfg, c.remoteSha!);
			const parent = c.localPath.includes("/") ? c.localPath.slice(0, c.localPath.lastIndexOf("/")) : "";
			await ensureFolder(vault, parent);
			const f = vault.getAbstractFileByPath(c.localPath);
			if (f instanceof TFile) await vault.modifyBinary(f, data);
			else if (await vault.adapter.exists(c.localPath)) await vault.adapter.writeBinary(c.localPath, data);
			else await vault.createBinary(c.localPath, data);
			next[c.localPath] = c.remoteSha!;
		} catch (e) {
			errors.push(`${c.localPath}: ${(e as Error).message}`);
		}
	}
	return { synced: next, errors };
}
