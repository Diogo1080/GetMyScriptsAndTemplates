import { Notice, Plugin } from "obsidian";
import { getLatestCommit, RepoConfig } from "./github";
import { UpdateModal } from "./modal";
import { DEFAULT_SETTINGS, PluginSettings, SettingsTab } from "./settings";
import { applyPlan, buildPlan } from "./sync";

export default class GetMyScriptsPlugin extends Plugin {
	settings!: PluginSettings;
	private intervalId: number | null = null;
	private checking = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new SettingsTab(this.app, this));

		this.addRibbonIcon("folder-sync", "Check templates & scripts for updates", () =>
			this.checkForUpdates(true)
		);

		this.addCommand({
			id: "check-for-updates",
			name: "Check for updates",
			callback: () => this.checkForUpdates(true),
		});

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.checkOnStartup) this.checkForUpdates(false);
			this.restartInterval();
		});
	}

	restartInterval(): void {
		if (this.intervalId !== null) window.clearInterval(this.intervalId);
		this.intervalId = null;
		const mins = this.settings.checkIntervalMinutes;
		if (mins > 0) {
			this.intervalId = this.registerInterval(
				window.setInterval(() => this.checkForUpdates(false), mins * 60 * 1000)
			);
		}
	}

	private repoConfig(): RepoConfig | null {
		const s = this.settings;
		if (!s.owner || !s.repo) return null;
		return { owner: s.owner, repo: s.repo, branch: s.branch || "main", token: s.token };
	}

	/**
	 * @param manual true when the user triggered it: shows "up to date" / config notices
	 *               and ignores a previously skipped version.
	 */
	async checkForUpdates(manual: boolean): Promise<void> {
		if (this.checking) return;
		const cfg = this.repoConfig();
		if (!cfg) {
			if (manual) new Notice("Set the GitHub repository in the plugin settings first.");
			return;
		}
		if (this.settings.mappings.length === 0) {
			if (manual) new Notice("Add at least one folder mapping in the plugin settings.");
			return;
		}

		this.checking = true;
		try {
			const commit = await getLatestCommit(cfg);
			const s = this.settings;
			if (!manual && (commit.sha === s.lastSyncedSha || commit.sha === s.skippedSha)) return;

			const plan = await buildPlan(this.app.vault, cfg, commit.sha, s.mappings, s.syncedFiles);
			if (plan.matchedFiles === 0 && plan.changes.length === 0) {
				const mapped = s.mappings.map((m) => `"${m.remotePath || "(repo root)"}"`).join(", ");
				const found = plan.repoFolders.length ? plan.repoFolders.join(", ") : "(no folders)";
				new Notice(
					`No files in ${cfg.owner}/${cfg.repo}@${cfg.branch} match your mappings (${mapped}).\n` +
						`Folders in the repo: ${found}\nNote: folder names are case-sensitive.`,
					15000
				);
				return;
			}
			if (plan.changes.length === 0) {
				s.lastSyncedSha = commit.sha;
				await this.saveSettings();
				if (manual) new Notice("Templates & scripts are up to date.");
				return;
			}

			new UpdateModal(this.app, plan, commit, async (decision) => {
				if (decision.action === "later") return;
				if (decision.action === "skip") {
					s.skippedSha = commit.sha;
					await this.saveSettings();
					return;
				}
				const notice = new Notice(`Updating ${decision.changes.length} file(s)…`, 0);
				const { synced, errors } = await applyPlan(this.app.vault, cfg, decision.changes, s.syncedFiles);
				notice.hide();
				s.syncedFiles = synced;
				s.lastSyncedSha = commit.sha;
				s.skippedSha = "";
				await this.saveSettings();
				if (errors.length) {
					console.error("[get-my-scripts-and-templates] sync errors", errors);
					new Notice(`Updated with ${errors.length} error(s). See the developer console.`);
				} else {
					new Notice(`Updated ${decision.changes.length} file(s) to ${commit.sha.slice(0, 7)}.`);
				}
			}).open();
		} catch (e) {
			console.error("[get-my-scripts-and-templates]", e);
			if (manual) new Notice(`Update check failed: ${(e as Error).message}`);
		} finally {
			this.checking = false;
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Avoid sharing the default arrays/objects between loads.
		this.settings.mappings = this.settings.mappings.map((m) => ({ ...m }));
		this.settings.syncedFiles = { ...this.settings.syncedFiles };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
