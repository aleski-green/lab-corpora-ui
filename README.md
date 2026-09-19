# CORPORA UI Lab

CORPORA is the interface layer for [Sapiens4](https://sapiens4.ai/): UI, dashboards, chats, workspaces, and settings for a multi-agent organization of autonomous Sapis.

This repository is a frontend lab. It uses demo data to explore how people supervise Sapis, move between individual and group conversations, inspect autonomous work, and share computer access. It does not connect to a production agent runtime.

Open `workspace/index.html` to explore CORPORA, or serve the repository locally:

```sh
python3 -m http.server 4174 --bind 127.0.0.1
```

| Module | Entry point | Purpose |
| --- | --- | --- |
| CORPORA | [workspace/index.html](workspace/index.html) | Explore dashboards, chats, settings, customizable browser tabs, and shared computer access with demo data. |
| Expressions | [avatars.html](avatars.html) | Generate individual Sapi kaomoji avatars used by CORPORA. |
| Groups | [groups.html](groups.html) | Generate Voronoi group avatars for multi-Sapi organizations. |
| Agent State | [agent-state-explorer.html](agent-state-explorer.html) | Paste, search, expand, and inspect large agent-state JSON trees. |

CORPORA is a clickable HTML prototype with local browser persistence. Conversations, agent execution, connected apps, schedules, and computer control are simulated. See the [CORPORA documentation](workspace/README.md) for interactions and scope. A portable single-file version is included at [workspace/demo-corpora-ui.html](workspace/demo-corpora-ui.html).

## Shared style

The modules share a visual language adapted from [sapiens4.ai](https://sapiens4.ai/): warm gray surfaces, dark navy text, monospace body type, magenta and violet accents, and fine borders. Generated avatar artwork keeps its existing pastel palettes and export behavior.

The generators and Agent State explorer share a module navigation bar; CORPORA has a hamburger placeholder for its future menu. The generators offer a light/dark toggle with a shared saved preference. CORPORA keeps compact panel toggles, readable chat text, and the shared-computer footer. Its owner-linked browser surface starts blank and accepts URL or HTML tabs; it does not style guest content.

Run `python3 build-prototype.py` after changing the workspace or shared theme to rebuild its portable HTML. The build regenerates the JavaScript fixture from `workspace/fixtures/sapiens-cases.json` and bundles it with both stylesheets and the workspace JavaScript; web fonts have local fallback fonts.

Verified desktop and 320px/390px layouts, expression controls, group peer creation and renaming, module navigation, workspace panel toggles, and JavaScript syntax.

## Shared group avatars

`assets/group-avatar.js` contains the Groups module’s weighted Voronoi renderer. Both the Groups editor and CORPORA group identities use it; the portable workspace bundles it as well. CORPORA provides All / Sapis / Groups filters and clickable `@Name` mentions that navigate to the matching individual or group conversation.

## Sample workflows

CORPORA starts with the Sapiens4 launch, customer feedback, and weekly business review cases: six Sapis, nine assignments, reports, evidence, and four dashboards. The editable data is in [workspace/fixtures/sapiens-cases.json](workspace/fixtures/sapiens-cases.json). See [fixture setup and reset instructions](workspace/README.md#development-fixtures). Everything runs statically with browser-local persistence.
