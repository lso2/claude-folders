# content/cf-project-import.js

The import button for a project's shared chats. It replaced the Folders panel's Import Shared Chats button in 1.3.5.

## Placement (measured 2026-10-28 in Brave on the "group chats" project)
Claude's project page has a `role="tablist"` with "Chats and tasks" and "Activity". The Activity tab panel (`role="tabpanel"`) holds `div > ul > li > a[href="/share/<snapshot uuid>"]`, one card per "Ken shared a chat" event. The button bar is inserted before that `ul`, inside its parent. The cards exist only while the Activity tab is selected, so the button appears only there.

## When it shows
`cfCheckProjectImport` runs on every burst of page mutations from content/cf-url-watch.js.
1. On `/project/<uuid>` with at least one `/share/` card in the tab panel, the project is read once per visit: `GET /api/organizations/<org>/projects/<uuid>` for the name (200 with `name` on 2026-10-28), then `listProjectShares` for its `conversation_shared` events.
2. Shares made by this user are left out (`/api/account` uuid against the event creator).
3. `cfReconcileImported` matches earlier imports, including ones made in another browser, and `cfFileUnfiledImports` files recorded imports missing from every folder.
4. The button is shown whenever others shared chats in the project. It reads "Import N shared chats" while N are not imported, and "Import shared chats" once all are.

Clicking it asks for confirmation with the count, then starts the same run as the share page's Import (`cfStartImportRun`). With every share imported, the confirmation reads "All N shared chats are already imported" and offers "Import N again", which imports each one again as another new chat.

## 1.3.6
Measured 2026-10-28 in the user's Chrome on the "group chats" project: "6 chats shared by others, 0 not imported", and the 1.3.5 rule hid the button. The user expects the button wherever shared chats are listed.

## Style
Since 1.3.9 the button has the Add to folder button's palette: #3d3d3a with #e8e6e3 text and a 1px #4d4d4a border, #4d4d4a on hover (inject.css `.cf-project-import`). The user asked for these buttons in a lighter shade of the page background with no color. The share page's Import button and the Cowork import button have the same palette.

1.3.5 to 1.3.8 used solid #d97706 with white text and no border, #b45309 on hover. The 1.3.0 buttons were blue (#2563eb).
