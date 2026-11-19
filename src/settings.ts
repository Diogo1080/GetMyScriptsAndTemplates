import { App, PluginSettingTab, Setting } from "obsidian";
import type GetMyScriptsPlugin from "./main";
import { FolderMapping, SyncedFiles } from "./sync";

export interface PluginSettings {
	owner: string;
	repo: string;
	branch: string;
	token: string;
	mappings: FolderMapping[];
	checkOnStartup: boolean;
	/** 0 disables periodic checks. */
	checkIntervalMinutes: number;

	// --- internal state ---
	lastSyncedSha: string;
	skippedSha: string;
	syncedFiles: SyncedFiles;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	owner: "",
	repo: "",
	branch: "main",
	token: "",
	mappings: [
		{ remotePath: "templates", localPath: "Templates" },
		{ remotePath: "scripts", localPath: "Scripts" },
	],
	checkOnStartup: true,
	checkIntervalMinutes: 60,
	lastSyncedSha: "",
	skippedSha: "",
	syncedFiles: {},
};

export class SettingsTab extends PluginSettingTab {
	constructor(app: App, private plugin: GetMyScriptsPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		const s = this.plugin.settings;
		const save = () => this.plugin.saveSettings();
		containerEl.empty();

		new Setting(containerEl).setName("Repository").setHeading();

		new Setting(containerEl)
			.setName("Repository")
			.setDesc("GitHub repo as owner/name, or paste its URL.")
			.addText((t) =>
				t
					.setPlaceholder("owner/my-templates")
					.setValue(s.owner && s.repo ? `${s.owner}/${s.repo}` : "")
					.onChange(async (v) => {
						const m = v.trim().replace(/\.git$/, "").match(/(?:github\.com[/:])?([^/\s]+)\/([^/\s]+)\/?$/);
						s.owner = m ? m[1] : "";
						s.repo = m ? m[2] : "";
						await save();
					})
			);

		new Setting(containerEl).setName("Branch").addText((t) =>
			t.setValue(s.branch).onChange(async (v) => {
				s.branch = v.trim() || "main";
				await save();
			})
		);

		new Setting(containerEl)
			.setName("Access token")
			.setDesc(
				"Needed for private repos (fine-grained token with read-only Contents access). Optional for public repos, but raises the API rate limit. Stored in this vault's plugin data.json."
			)
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(s.token).onChange(async (v) => {
					s.token = v.trim();
					await save();
				});
			});

		new Setting(containerEl).setName("Folder mappings").setHeading();
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Each repo folder is copied into the given vault folder. Leave the repo folder empty to use the repo root.",
		});

		s.mappings.forEach((m, i) => {
			new Setting(containerEl)
				.addText((t) =>
					t
						.setPlaceholder("repo folder")
						.setValue(m.remotePath)
						.onChange(async (v) => {
							m.remotePath = v.trim();
							await save();
						})
				)
				.addText((t) =>
					t
						.setPlaceholder("vault folder")
						.setValue(m.localPath)
						.onChange(async (v) => {
							m.localPath = v.trim();
							await save();
						})
				)
				.addExtraButton((b) =>
					b
						.setIcon("trash")
						.setTooltip("Remove mapping")
						.onClick(async () => {
							s.mappings.splice(i, 1);
							await save();
							this.display();
						})
				);
		});

		new Setting(containerEl).addButton((b) =>
			b.setButtonText("Add mapping").onClick(async () => {
				s.mappings.push({ remotePath: "", localPath: "" });
				await save();
				this.display();
			})
		);

		new Setting(containerEl).setName("Update checks").setHeading();

		new Setting(containerEl).setName("Check when Obsidian starts").addToggle((t) =>
			t.setValue(s.checkOnStartup).onChange(async (v) => {
				s.checkOnStartup = v;
				await save();
			})
		);

		new Setting(containerEl)
			.setName("Check every (minutes)")
			.setDesc("0 turns periodic checks off.")
			.addText((t) => {
				t.inputEl.type = "number";
				t.setValue(String(s.checkIntervalMinutes)).onChange(async (v) => {
					const n = Math.max(0, Math.floor(Number(v) || 0));
					s.checkIntervalMinutes = n;
					await save();
					this.plugin.restartInterval();
				});
			});

		new Setting(containerEl)
			.setName("Check now")
			.setDesc(
				s.lastSyncedSha ? `Last synced commit: ${s.lastSyncedSha.slice(0, 7)}` : "Nothing synced yet."
			)
			.addButton((b) =>
				b.setButtonText("Check for updates").onClick(() => this.plugin.checkForUpdates(true))
			);
	}
}
