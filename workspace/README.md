# CORPORA UI lab

CORPORA provides the UI, dashboards, chats, workspaces, and settings for Sapiens4, a multi-agent organization of autonomous Sapis. This module is a frontend lab built with demo data: conversations, tasks, schedules, shared computer locks, and agent activity are simulated.

Open `index.html` through a local server, or open the portable `demo-corpora-ui.html`. Rebuild the portable file with `python3 build-prototype.py` from the repository root.

## Interface

- CORPORA contains All / Sapis / Groups, search, creation, chats, and the shared-computer footer.
- Group identities use the Groups module’s weighted Voronoi renderer in `assets/group-avatar.js`.
- Known names and `@Name` mentions open the matching chat and restore it if hidden. Drafts survive switching chats.
- The three header icons independently toggle the chat list, conversation, and workspace. The hamburger is a placeholder for a future menu.
- The light/dark button shares a saved preference with Expressions and Groups. Until explicitly chosen, it follows the system preference.
- Shared-computer controls open from the footer. The lock, queue, handoff, pause, and simulated autonomous execution remain available.

## Browser workspace

The heading is `@Name’s workspace`; clicking the name returns to its chat, including when only the workspace is expanded. Each Sapi/group keeps its own tabs. Existing local tab names and URLs are retained; old built-in mock screens become blank browser tabs. Existing conversations and tasks remain intact.

The content area is an unstyled iframe surface, populated with the sample case reports and dashboards by default. Add a blank tab, an HTTP(S) URL, or an HTML document. Tabs can be closed, renamed, edited, and reordered by drag or menu. The address field navigates the active tab, reload refreshes it, and the external link opens a URL outside the embed. Switching tabs/chat preserves live frames during the session; reload reconstructs them from saved URLs/HTML, not from a snapshot of guest runtime state.

Guest scripts are sandboxed without same-origin access to the shell. This is a browser-based prototype, not Electron or a native Chromium host. Some websites reject framing or require capabilities/authentication unavailable in a sandbox. Such sites can be opened through the external-link control. A native implementation should replace the iframe adapter with isolated WebContentsView instances and implement navigation/permissions in the host.

## Themes and guest pages

The shared shell theme does not inject CSS into guests. Generated documents can opt into `color-scheme: light dark` and `prefers-color-scheme` to follow the embedding color scheme while retaining their own design. Plain or hard-coded third-party pages may keep their original colors.

Cross-origin iframe CSS cannot be edited by the shell. Electron's `webContents.insertCSS()` allows a native host to add/remove an optional page override; this requires per-navigation lifecycle handling and cannot guarantee a good result on every site. Prefer a site's native theme or theme-aware generated HTML. The prototype does not claim to implement forced third-party theming.

## Scope and verification

There is no backend, LLM, real computer control, or background scheduler. Agent execution and schedules remain simulated; real supplied website content is embedded where permitted. Data persists in localStorage. Google Fonts is optional.

Verified light/dark switching, owner shortcut from an expanded workspace, per-owner tabs, tab persistence after reload, supplied HTML button interaction, URL document loading, and shared-computer controls. The new header fits narrow layouts. JavaScript syntax and diff whitespace checks pass.

## Development fixtures

The default workspace now uses [fixtures/sapiens-cases.json](fixtures/sapiens-cases.json), a static snapshot of the three sample workflows created in Sapiens4:

- Product launch: competitor evidence, RelayDesk launch plan, and launch dashboard.
- Customer feedback: 12 synthetic records, extracted evidence, priorities, and results dashboard.
- Weekly business review: four weeks of synthetic metrics, review, and business dashboard.

It includes six Sapis with their current names and manager IDs, six completed assignments, three queued follow-ups, task activity, paused checks, assignment/result conversations, 23 owner-specific artifacts, and four distinct dashboards (including the team overview). Historical documents keep their original author names and review-time wording. Completion notices in the fixture chat clarify final task status. Atlas opens with the team overview selected. Assisted mode leaves queued work available for manual UI simulation.

### Edit and rebuild

Edit the JSON source, then run from the repository root:

```sh
python3 build-prototype.py
python3 -m http.server 4175 --bind 127.0.0.1
```

Open `http://127.0.0.1:4175/workspace/`. Port 4175 can run alongside the Sapiens backend on 4174. The build regenerates both `fixtures/sapiens-cases.js` and the portable `demo-corpora-ui.html`; do not edit either generated file by hand. No backend or model account is required, including when opening the portable file directly.

The JSON has `schemaVersion`, provenance, `state`, and `artifacts`. `state` contains the prototype's agents, tasks, messages, logs, schedules, and per-owner workspaces. Workspace tabs reference `artifacts[].id` via `artifactId`; artifact records contain raw `content` and optional `previewHtml` for Markdown/JSON. The generated script exposes `globalThis.CorporaFixture`, resolves these into iframe HTML, and selects the initial tabs. Artifact tags in chat open the matching document; matching by stable tag supports older title slugs.

Browser edits use the separate localStorage key `corpora-sapiens-cases-v1`. After editing/rebuilding the fixture, use **Workspace settings → Reset demo data** to load the new fixture and restore all owners' tabs. Reload alone preserves local edits. The previous Brightside demo's storage is left untouched. Reset applies only to this static UI lab, never the live Sapiens data.

The fixture excludes credentials, machine paths, runtime settings, memory consolidation, and raw tool traces. All business inputs remain clearly labeled SAMPLE DATA. It is a development snapshot, not an API backup or a live synchronization mechanism.

## Compact neutral appearance

The workspace uses system typography, white/charcoal themes, a compact agent list, and unboxed assistant replies. Long messages keep their complete original text inside **Show full message**; task references use the existing task title in the collapsed preview. Artifact buttons use the existing document title. Activity and Schedules live under **More**, and suggested prompts are collapsed by default. The existing demo fixture and storage key are unchanged. Embedded documents retain their own styles.

Workspace appearance overrides are scoped to `body.sapi-workspace` in `assets/sapi-theme.css`; other lab modules retain their existing design. Rebuild the portable HTML after editing the source.

The pink **Sapiens4** wordmark opens `#home:root`, restores the panels, and selects the main Sapi’s chat, including on direct navigation or reload. Agent colors and latest-update previews remain visible. Interactive shell controls use pink hover and focus accents in both themes; panel toggles stay neutral at rest.
