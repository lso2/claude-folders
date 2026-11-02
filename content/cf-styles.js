// content/cf-styles.js
// Adds the runtime stylesheet for the folders panel and its modals to Claude's page.
// Globals: injectStyles
// Notes: docs/notes/content/cf-styles.js.md

// A selector styled in inject.css is not repeated here. This sheet is later in the cascade, and a
// copy here overrides inject.css at equal specificity.
function injectStyles() {
  if (document.getElementById('claude-folders-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'claude-folders-styles';
  style.textContent = `
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
    .organize-auto-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: var(--cf-orange);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .organize-auto-btn:hover {
      background: var(--cf-orange-hover);
    }
    .organize-steps-label {
      margin: 10px 0 6px;
      font-size: 11px;
      color: #9c9a92;
    }
    .ask-claude-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: var(--cf-orange);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ask-claude-btn:hover {
      background: var(--cf-orange-hover);
      transform: translateY(-1px);
    }
    .apply-categories-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      margin-top: 8px;
      background: #059669;
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .apply-categories-btn:hover {
      background: #047857;
      transform: translateY(-1px);
    }
    .cf-account-view {
      padding: 10px 16px;
      border-bottom: 1px solid #3d3d3a;
    }
    .cf-account-select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      background: #232321;
      color: #e8e6e3;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
    }
    .cf-account-select:hover {
      background: #3d3d3a;
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
    .folders-picker-list {
      flex: 1;
      overflow-y: auto;
      max-height: 50vh;
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
      border-color: var(--cf-orange);
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
      background: var(--cf-orange);
      border: none;
      color: #fff;
    }
    .modal-btn.preview-btn:hover { background: var(--cf-orange-hover); }
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
      background: #059669;
      color: #fff;
    }
    .modal-btn.apply-btn.ready:hover {
      background: #047857;
    }
  `;
  document.head.appendChild(style);
}
