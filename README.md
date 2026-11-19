# Get My Scripts and Templates

An Obsidian plugin that keeps your templates and scripts in **one GitHub repo** and syncs them into every vault you use. When the repo has a new commit, the plugin shows what changed and asks whether to update.

## How it works

- You map repo folders to vault folders (for example, `templates` → `Templates` and `scripts` → `Scripts/js`).
- The plugin checks the branch's latest commit at startup and on an interval you set.
- If any mapped file differs from your vault, a dialog lists every file that is **new**, **changed** or **removed**, and offers three buttons:
  - **Update** applies the files you left checked.
  - **Later** asks again at the next check.
  - **Skip this version** stops asking until the repo gets another commit.
- **Your local edits are protected.** The plugin records the git blob hash of every file it writes. If you edited a synced file in a vault, the dialog flags it as "edited locally" and leaves it unchecked, so it isn't overwritten unless you choose to.
- Removing a file from the repo moves the vault copy to the system trash. Files you added to the vault yourself are never touched.
- The plugin only writes inside the vault folders you map. It never writes to hidden folders or to the `.obsidian` config folder, so it can't install or change plugins.
- Downloaded files are plain files, such as templates and scripts for Templater or QuickAdd. This plugin never runs them.
- No git install is needed, and it works on mobile.

## Network use and accounts

The plugin needs network access and a GitHub account, so here is exactly what it does:

- **Remote service:** it calls only the **GitHub REST API** (`https://api.github.com`), for the single repository you configure. It does this to find the latest commit on your branch, list the repo's files, and download the files that changed.
- **When:** at startup (optional), on the interval you set (optional), and when you run **Check for updates**.
- **Account:** your templates must be in a GitHub repository. A GitHub **personal access token** is needed for private repos; public repos work without one. The token is sent only to `api.github.com`, and only as an `Authorization` header.
- **Telemetry:** none, and no other data leaves your device.

## Setup

1. Push your templates and scripts to a GitHub repo, for example:
   ```
   my-obsidian-kit/
     templates/
     scripts/
   ```
2. Install the plugin in a vault (see *Development* below).
3. In **Settings → Get My Scripts and Templates**:
   - **Repository**: `owner/my-obsidian-kit` (a full URL also works).
   - **Branch**: `main`.
   - **Access token**: required for private repos. Create a [fine-grained token](https://github.com/settings/personal-access-tokens/new) limited to that repo with **Contents: Read-only**. The token is stored in plain text in the vault's `.obsidian/plugins/get-my-scripts-and-templates/data.json`, so don't commit or share that file.
   - **Folder mappings**: repo folder → vault folder.
4. Run **Check for updates** from the command palette or the ribbon icon.

## Development

```bash
npm install
npm run dev     # rebuild on every change
npm run build   # production build
```

To test it, copy or symlink `main.js` and `manifest.json` into `<vault>/.obsidian/plugins/get-my-scripts-and-templates/`, then enable the plugin in **Community plugins**.

## Limits

- GitHub only, for now.
- Without a token the API allows 60 requests per hour. A check uses 1–2 requests, and an update uses one more request per changed file.
- Repos big enough for GitHub to truncate the tree listing aren't supported. That's around 100k files, far more than a templates repo needs.

## License

[MIT](LICENSE)
