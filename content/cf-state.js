// content/cf-state.js
// Holds the mutable state every content-script part reads and writes.
// Globals: folders, categories, allChats, metadata, cfOrganizeIndex, cfLegacyAvailable,
//          currentChatId, sidebarInjected, panelExpanded, sidebarInjectRetries,
//          chatButtonRetries, cfActiveOrgId, cfAccountList, cfAccountView, CF_FOLDER_ICON_PATH
// Notes: docs/notes/content/cf-state.js.md

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let cfOrganizeIndex = []; // ordered chat ids from the last "Ask Claude" prompt
let cfLegacyAvailable = false; // older data exists that this account can restore by syncing
let currentChatId = null;
let sidebarInjected = false;
let panelExpanded = false;
let sidebarInjectRetries = 0;
let chatButtonRetries = 0;
let cfActiveOrgId = null; // set at startup so chat rows can flag other accounts
let cfAccountList = null; // the background's listAccounts answer, read when the panel opens
let cfAccountView = null; // 'all', 'acct:<key>' or 'org:<key>:<org id>' (content/cf-account-view.js)

// Shared folder glyph used for the sidebar nav icon and panel headers
const CF_FOLDER_ICON_PATH = 'M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z';
