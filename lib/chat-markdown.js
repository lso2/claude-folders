// lib/chat-markdown.js
// Converts Claude conversation and shared-snapshot JSON into markdown export files.
// Loaded by the content scripts, the offscreen writer, the organizer and the popup.
// Globals: sanitizeFilename, generateExportFilename, currentBranchMessages, mdToolResultText,
//          mdToolUseText, mdBlockToText, mdAttachmentLines, messagesToMarkdown,
//          convertToMarkdown, snapshotToMarkdown
// Notes: docs/notes/lib/chat-markdown.js.md

function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .substring(0, 80)
    .trim();
}

// The 8-character id prefix is what the export checks match on, so it never changes
function generateExportFilename(chatId, title) {
  const prefix = String(chatId || 'unknown').substring(0, 8);
  return `${prefix}_${sanitizeFilename(title || 'Untitled')}.md`;
}

// A tree=True conversation holds every branch; the export follows the visible one
function currentBranchMessages(convoData) {
  const all = convoData.chat_messages || [];
  if (!convoData.current_leaf_message_uuid) return all;
  const byId = new Map(all.map(m => [m.uuid, m]));
  const branch = [];
  let uuid = convoData.current_leaf_message_uuid;
  while (uuid && byId.has(uuid) && branch.length < all.length) {
    const msg = byId.get(uuid);
    branch.unshift(msg);
    uuid = msg.parent_message_uuid;
  }
  return branch.length ? branch : all;
}

function mdToolResultText(block) {
  if (block.is_error) return '*[Tool error]*';
  const items = Array.isArray(block.content) ? block.content : [block.content];
  const lines = [];
  for (const item of items) {
    if (!item) continue;
    if (typeof item === 'string') lines.push(item);
    else if (item.type === 'text' && item.text) lines.push(item.text);
    else if (item.url) lines.push(`- [${String(item.title || item.url).replace(/[\[\]]/g, '')}](${item.url})`);
    else if (item.title) lines.push(`- ${item.title}`);
    else if (item.type === 'image') lines.push('*[Image]*');
  }
  return lines.length ? `*[Tool result]*\n${lines.join('\n')}` : '*[Tool result]*';
}

function mdToolUseText(block) {
  const input = block.input || {};
  const name = block.name || 'unknown';
  // Artifacts and created files carry their full text in the tool input
  const body = input.content || input.file_text || input.code;
  if (typeof body === 'string' && body.length) {
    const label = input.title || input.path || input.id || name;
    const lang = input.language || '';
    return `<details>\n<summary>${name}: ${label}</summary>\n\n\`\`\`${lang}\n${body}\n\`\`\`\n</details>`;
  }
  const detail = input.query || input.command || input.url || input.path || '';
  return detail ? `*[Tool: ${name} "${String(detail).slice(0, 200)}"]*` : `*[Tool: ${name}]*`;
}

function mdBlockToText(block) {
  if (typeof block === 'string') return block;
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'text') return block.text || '';
  if (block.type === 'thinking') {
    return block.thinking ? `<details>\n<summary>Thinking</summary>\n\n${block.thinking}\n</details>` : '';
  }
  if (block.type === 'tool_use') return mdToolUseText(block);
  if (block.type === 'tool_result') return mdToolResultText(block);
  if (block.type === 'code') return `\`\`\`${block.language || ''}\n${block.text || block.code || ''}\n\`\`\``;
  if (block.type === 'image') return '*[Image]*';
  if (block.type === 'document') return `*[Document: ${block.title || block.name || 'untitled'}]*`;
  return `*[${block.type || 'unknown'} block]*`;
}

function mdAttachmentLines(msg) {
  const lines = [];
  const files = [].concat(msg.files || [], msg.files_v2 || []);
  for (const file of files) {
    const name = file.file_name || 'file';
    lines.push(file.file_kind === 'image' ? `*Image: ${name}*` : `*Attachment: ${name}*`);
  }
  for (const att of msg.attachments || []) {
    lines.push(`*Attachment: ${att.file_name || 'file'}*`);
  }
  for (const artifact of msg.artifacts || []) {
    lines.push(`<details>\n<summary>Artifact: ${artifact.title || artifact.name || 'Untitled'}</summary>\n\n\`\`\`${artifact.language || ''}\n${artifact.content || ''}\n\`\`\`\n</details>`);
  }
  return lines;
}

function messagesToMarkdown(messages) {
  let md = '';
  for (const msg of messages || []) {
    md += msg.sender === 'human' ? '## Human\n\n' : '## Claude\n\n';
    let content = '';
    if (typeof msg.content === 'string') content = msg.content;
    else if (Array.isArray(msg.content)) content = msg.content.map(mdBlockToText).filter(Boolean).join('\n\n');
    if (!content && msg.text) content = Array.isArray(msg.text) ? msg.text.join('\n\n') : String(msg.text);
    const extra = mdAttachmentLines(msg);
    if (extra.length) content += (content ? '\n\n' : '') + extra.join('\n\n');
    md += `${content.trim()}\n\n---\n\n`;
  }
  return md;
}

function convertToMarkdown(convoData, title, chatIdOverride) {
  const chatId = chatIdOverride || convoData.uuid || '';
  let md = `# ${title || convoData.name || 'Untitled'}\n\n`;
  md += `**Exported:** ${new Date().toISOString().split('T')[0]}  \n`;
  md += `**URL:** https://claude.ai/chat/${chatId}  \n`;
  md += `**Chat ID:** ${chatId}\n\n---\n\n`;
  return md + messagesToMarkdown(convoData.chat_messages);
}

// A shared snapshot is a copy of someone else's conversation, so its header names
// the person who shared it and the link it was shared at
function snapshotToMarkdown(snapshot, projectName) {
  const title = snapshot.snapshot_name || 'Shared chat';
  const sharedBy = (snapshot.creator && snapshot.creator.full_name) || snapshot.created_by || 'Unknown';
  let md = `# ${title}\n\n`;
  md += `**Shared by:** ${sharedBy}  \n`;
  if (projectName) md += `**Project:** ${projectName}  \n`;
  md += `**Shared link:** https://claude.ai/share/${snapshot.uuid}  \n`;
  if (snapshot.conversation_uuid) md += `**Original chat ID:** ${snapshot.conversation_uuid}  \n`;
  md += `**Exported:** ${new Date().toISOString().split('T')[0]}\n\n---\n\n`;
  return md + messagesToMarkdown(snapshot.chat_messages);
}
