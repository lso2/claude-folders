// content/cf-styles.js
// Adds the runtime stylesheet for the folders panel and its modals to Claude's page.
// Globals: injectStyles
// Notes: docs/notes/content/cf-styles.js.md

function injectStyles() {
  if (document.getElementById('claude-folders-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'claude-folders-styles';
  style.textContent = `
    .claude-folders-panel {
      position: fixed;
      left: 260px;
      top: 0;
      width: 280px;
      height: 100vh;
      background: #2a2a28;
      border-right: 1px solid #3d3d3a;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 4px 0 12px rgba(0,0,0,0.3);
    }
    .folders-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .folders-panel-header h2 {
      margin: 0;
      font-size: 16px;
      color: #e8e6e3;
      font-weight: 500;
    }
    .panel-actions {
      display: flex;
      gap: 8px;
    }
    .panel-btn {
      background: transparent;
      border: none;
      color: #9c9a92;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel-btn:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .panel-text-btn {
      background: transparent;
      border: none;
      color: #9c9a92;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
    .panel-text-btn:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .folders-panel-actions {
      padding: 8px 12px;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .ask-claude-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ask-claude-btn:hover {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      transform: translateY(-1px);
    }
    .apply-categories-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      margin-top: 8px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .apply-categories-btn:hover {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      transform: translateY(-1px);
    }
    .folders-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    .folders-empty {
      padding: 40px 20px;
      text-align: center;
      color: #9c9a92;
    }
    .folder-category-group {
      margin-bottom: 8px;
    }
    .folder-category-header {
      padding: 8px 16px;
      font-size: 11px;
      font-weight: 600;
      color: #9c9a92;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .folder-panel-item {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .folder-panel-item:hover {
      background: #3d3d3a;
    }
    .folder-panel-name {
      flex: 1;
      color: #e8e6e3;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .folder-panel-count {
      color: #9c9a92;
      font-size: 12px;
      margin-left: 8px;
    }
    .folder-expand-icon {
      margin-left: 4px;
      transition: transform 0.15s;
      opacity: 0.6;
    }
    .folder-chats-list {
      background: #232321;
      padding: 4px 0;
    }
    .folder-chat-link {
      display: block;
      padding: 6px 16px 6px 38px;
      color: #a8a6a0;
      font-size: 12px;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.1s;
    }
    .cf-org-filter {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 16px;
      border-bottom: 1px solid #3d3d3a;
    }
    .cf-org-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border: 1px solid #3d3d3a;
      border-radius: 12px;
      background: transparent;
      color: #a8a6a0;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }
    .cf-org-chip:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .cf-org-chip-on {
      background: #d97706;
      border-color: #d97706;
      color: #ffffff;
    }
    .cf-org-chip-count {
      opacity: 0.75;
      font-variant-numeric: tabular-nums;
    }
    .folder-chat-org {
      display: inline-block;
      margin-right: 6px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      font-size: 10px;
      vertical-align: 1px;
    }
    .folder-chat-link:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .folder-chat-more {
      padding: 6px 16px 6px 38px;
      color: #7a786e;
      font-size: 11px;
      font-style: italic;
    }
    .folder-load-more-btn {
      display: block;
      width: calc(100% - 32px);
      margin: 6px 16px 6px 16px;
      padding: 8px;
      background: #2a2a28;
      border: 1px dashed #4a4a48;
      border-radius: 6px;
      color: #d97706;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      text-align: center;
    }
    .folder-load-more-btn:hover {
      background: #3a3a38;
      border-style: solid;
      color: #f59e0b;
    }
    .panel-folders-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    .panel-analytics-view {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .panel-analytics-header {
      margin-bottom: 12px;
    }
    .panel-donut-container {
      display: flex;
      justify-content: center;
      margin: 16px 0;
    }
    .panel-analytics-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .panel-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: #9c9a92;
    }
    .panel-legend-color {
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }
    .panel-analytics-stats {
      background: #232321;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      padding: 10px;
    }
    .panel-stat-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 11px;
      border-bottom: 1px solid #3d3d3a;
    }
    .panel-stat-row:last-child {
      border-bottom: none;
    }
    .panel-stat-label { color: #9c9a92; }
    .panel-stat-value { color: #e8e6e3; font-weight: 500; }
    /* The chat buttons are styled once, in inject.css. A copy lived here too, and
       being later in the cascade at equal specificity it beat
       .claude-export-btn's own colour, so the export button turned grey a moment
       after the page styled it green. */
    .claude-folders-picker {
      position: fixed;
      background: #2a2a28;
      border: 1px solid #3d3d3a;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 10001;
      min-width: 280px;
      max-width: 350px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .folders-picker-header {
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #9c9a92;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .folders-picker-list {
      flex: 1;
      overflow-y: auto;
      max-height: 50vh;
    }
    .folder-picker-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .folder-picker-item:hover {
      background: #3d3d3a;
    }
    .folder-picker-item .folder-category {
      font-size: 10px;
      color: #9c9a92;
      text-transform: uppercase;
    }
    .folder-picker-item .folder-name {
      color: #e8e6e3;
      font-size: 14px;
    }
    .folder-picker-divider {
      height: 1px;
      background: #3d3d3a;
      margin: 8px 0;
    }
    .folder-picker-new {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .new-folder-input {
      padding: 8px 12px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      color: #e8e6e3;
      font-size: 13px;
    }
    .new-folder-select {
      padding: 8px 12px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      color: #e8e6e3;
      font-size: 13px;
    }
    .create-folder-btn {
      padding: 8px 16px;
      background: #b87333;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      cursor: pointer;
    }
    .create-folder-btn:hover {
      background: #c98040;
    }
    .categories-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 10003;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .categories-modal {
      background: #2a2a28;
      border: 1px solid #3d3d3a;
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .categories-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #3d3d3a;
    }
    .categories-modal-header h3 {
      margin: 0;
      color: #e8e6e3;
      font-size: 16px;
    }
    .modal-close-btn {
      background: none;
      border: none;
      color: #9c9a92;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .modal-close-btn:hover { color: #e8e6e3; }
    .categories-modal-body {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
    }
    .categories-modal-body p {
      margin: 0 0 12px 0;
      color: #9c9a92;
      font-size: 14px;
    }
    .categories-modal-body textarea {
      width: 100%;
      height: 200px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 8px;
      color: #e8e6e3;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      resize: vertical;
    }
    .categories-modal-body textarea:focus {
      outline: none;
      border-color: #d97706;
    }
    .modal-stats {
      margin-top: 12px;
      padding: 12px;
      background: #1a1a18;
      border-radius: 8px;
      font-size: 13px;
      color: #9c9a92;
      line-height: 1.6;
    }
    .categories-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid #3d3d3a;
    }
    .modal-btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .modal-btn.cancel-btn {
      background: transparent;
      border: 1px solid #3d3d3a;
      color: #9c9a92;
    }
    .modal-btn.cancel-btn:hover {
      border-color: #5d5d5a;
      color: #e8e6e3;
    }
    .modal-btn.preview-btn {
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      border: none;
      color: #fff;
    }
    .modal-btn.preview-btn:hover { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
    .modal-btn.preview-btn.done {
      background: #3d3d3a;
      color: #9c9a92;
    }
    .modal-btn.apply-btn {
      background: #3d3d3a;
      border: none;
      color: #9c9a92;
    }
    .modal-btn.apply-btn:hover:not(:disabled) {
      background: #4d4d4a;
    }
    .modal-btn.apply-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .modal-btn.apply-btn.ready {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #fff;
    }
    .modal-btn.apply-btn.ready:hover {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
  `;
  document.head.appendChild(style);
}
