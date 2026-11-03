# Setting up Prompt Builder

## Publish it (once)

1. On GitHub, create an empty public repository named `prompt-builder` (no README, no licence).
2. Upload or push this folder to the `main` branch.
3. Open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and wait for the green tick. The app is then at `https://sathyanarayanan-2001.github.io/prompt-builder/`.

## Laptops (Chrome or Edge)

1. Open the live address. In **Setup**, press **Install app**.
2. In **Setup**, press **Choose sync folder** and pick a folder inside OneDrive, for example `OneDrive/Prompt Builder`.
3. Restore your starter backup once: **Setup → Restore from backup** and pick `Prompt_Builder_Starter_Backup.json`.
4. On the second laptop, install and choose the same folder. Its prompts arrive within a minute of OneDrive syncing.

## Android phone (Chrome 132 or later)

1. The OneDrive app does not keep a real folder on the phone. Install a two-way sync app (for example OneSync) and mirror the OneDrive `Prompt Builder` folder to a phone folder.
2. Open the live address in Chrome and install it to the home screen (installed apps keep folder permission).
3. In **Setup**, press **Choose sync folder** and pick the mirrored phone folder.

iPhone, Firefox and Safari cannot open folders; use **Download backup** and **Restore from backup** instead.

## Moving your Prompt Manager library across

In **Library**, press **Import from Prompt Manager** and choose `Prompting.zip` or the `prompt_repository` folder. The preview shows each prompt as New, New version or Already stored; nothing is saved until you press **Import**. To go back the other way, press **Export all to Prompt Manager** and unzip the result next to `prompt_manager.py`.

## Check it works (your devices)

| Check | How | Pass looks like |
| --- | --- | --- |
| First visit | Open in a private window | Start shows; chip says This device only |
| Reuse | Save a version, start a new prompt, press Previous on Role | The earlier role is listed |
| Two devices | Save a prompt on each, wait for OneDrive, switch back to each tab | Both prompts on both; a deletion on one reaches the other |
| Offline | Open once, switch on airplane mode, reopen | The app opens with your prompts |
| Prompt Manager | Export all, unzip next to prompt_manager.py, run it | Every prompt, thinking and tag set appears unchanged |
