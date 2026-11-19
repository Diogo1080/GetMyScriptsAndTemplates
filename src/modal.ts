import { App, Modal, Setting } from "obsidian";
import { CommitInfo } from "./github";
import { Change, SyncPlan } from "./sync";

export type UpdateDecision =
	| { action: "update"; changes: Change[] }
	| { action: "skip" } // ignore this version
	| { action: "later" }; // ask again next check

const LABEL: Record<Change["kind"], string> = { add: "New", update: "Changed", delete: "Removed" };

export class UpdateModal extends Modal {
	private decided = false;
	private selected: Set<string>;

	constructor(
		app: App,
		private plan: SyncPlan,
		private commit: CommitInfo,
		private onDecide: (d: UpdateDecision) => void
	) {
		super(app);
		// Pre-select everything that won't destroy local edits.
		this.selected = new Set(plan.changes.filter((c) => !c.locallyModified).map((c) => c.localPath));
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		this.titleEl.setText("Templates & scripts update available");

		const firstLine = this.commit.message.split("\n")[0];
		contentEl.createEl("p", {
			text: `Latest commit ${this.commit.sha.slice(0, 7)}: "${firstLine}"`,
		});

		const conflicts = this.plan.changes.filter((c) => c.locallyModified).length;
		if (conflicts > 0) {
			contentEl.createEl("p", {
				cls: "mod-warning",
				text: `${conflicts} file(s) were edited in this vault. They are unchecked so your edits are kept; check them to overwrite with the repo version.`,
			});
		}

		const list = contentEl.createDiv({ cls: "gmst-change-list" });
		for (const c of this.plan.changes) {
			const desc = c.locallyModified ? `${LABEL[c.kind]} — edited locally` : LABEL[c.kind];
			new Setting(list)
				.setName(c.localPath)
				.setDesc(desc)
				.addToggle((t) =>
					t.setValue(this.selected.has(c.localPath)).onChange((v) => {
						if (v) this.selected.add(c.localPath);
						else this.selected.delete(c.localPath);
					})
				);
		}

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText("Update")
					.setCta()
					.onClick(() =>
						this.finish({
							action: "update",
							changes: this.plan.changes.filter((c) => this.selected.has(c.localPath)),
						})
					)
			)
			.addButton((b) => b.setButtonText("Later").onClick(() => this.finish({ action: "later" })))
			.addButton((b) =>
				b
					.setButtonText("Skip this version")
					.setTooltip("Don't ask again until the repo changes again")
					.onClick(() => this.finish({ action: "skip" }))
			);
	}

	private finish(d: UpdateDecision): void {
		this.decided = true;
		this.onDecide(d);
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decided) this.onDecide({ action: "later" });
	}
}
