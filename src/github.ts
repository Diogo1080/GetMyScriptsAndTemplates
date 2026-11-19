import { requestUrl, RequestUrlParam } from "obsidian";

export interface RepoConfig {
	owner: string;
	repo: string;
	branch: string;
	token: string;
}

export interface TreeEntry {
	path: string;
	sha: string;
}

export interface CommitInfo {
	sha: string;
	message: string;
	date: string;
}

const API = "https://api.github.com";

async function gh<T>(cfg: RepoConfig, path: string): Promise<T> {
	const params: RequestUrlParam = {
		url: `${API}${path}`,
		method: "GET",
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
		},
		throw: false,
	};
	const res = await requestUrl(params);
	if (res.status >= 400) {
		let detail = "";
		try {
			detail = res.json?.message ?? "";
		} catch {
			/* body was not JSON */
		}
		throw new Error(`GitHub API ${res.status} on ${path}${detail ? `: ${detail}` : ""}`);
	}
	return res.json as T;
}

const enc = encodeURIComponent;

export async function getLatestCommit(cfg: RepoConfig): Promise<CommitInfo> {
	const data = await gh<{ sha: string; commit: { message: string; committer: { date: string } } }>(
		cfg,
		`/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/commits/${enc(cfg.branch)}`
	);
	return {
		sha: data.sha,
		message: data.commit.message,
		date: data.commit.committer?.date ?? "",
	};
}

/** All blobs (files) in the repo at the given commit. */
export async function getTree(cfg: RepoConfig, commitSha: string): Promise<TreeEntry[]> {
	const data = await gh<{
		truncated: boolean;
		tree: { path: string; type: string; sha: string }[];
	}>(cfg, `/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/git/trees/${commitSha}?recursive=1`);
	if (data.truncated) {
		throw new Error(
			"Repository tree is too large for the GitHub API (truncated). Use a smaller repo for templates/scripts."
		);
	}
	return data.tree.filter((e) => e.type === "blob").map((e) => ({ path: e.path, sha: e.sha }));
}

export async function getBlob(cfg: RepoConfig, sha: string): Promise<ArrayBuffer> {
	const data = await gh<{ content: string; encoding: string }>(
		cfg,
		`/repos/${enc(cfg.owner)}/${enc(cfg.repo)}/git/blobs/${sha}`
	);
	if (data.encoding !== "base64") throw new Error(`Unexpected blob encoding: ${data.encoding}`);
	const bin = atob(data.content.replace(/\s/g, ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes.buffer;
}

/** Same hash git uses for blobs, so local files can be compared to remote ones without downloading. */
export async function gitBlobSha(content: ArrayBuffer): Promise<string> {
	const header = new TextEncoder().encode(`blob ${content.byteLength}\0`);
	const buf = new Uint8Array(header.length + content.byteLength);
	buf.set(header, 0);
	buf.set(new Uint8Array(content), header.length);
	const digest = await crypto.subtle.digest("SHA-1", buf);
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}
