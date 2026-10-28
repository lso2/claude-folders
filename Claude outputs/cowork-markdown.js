// lib/cowork-markdown.js
// Converts a Cowork session's event log into the markdown export format.
// Loaded by the content scripts, the offscreen writer and the access window.
// Globals: COWORK_MESSAGE_TOOL, coworkBlocks, coworkBlocksText, coworkIsPrompt,
//          coworkPromptMessage, coworkEventsToMessages, coworkToMarkdown
// Depends on: lib/chat-markdown.js (messagesToMarkdown, mdBlockToText),
//             lib/cowork-api.js (coworkSessionUrl)
// Notes: docs/notes/lib/cowork-markdown.js.md

// Claude's messages to the person in a Cowork session are calls to this tool
const COWORK_MESSAGE_TOOL = 'SendUserMessage';

function coworkBlocks(message) {
  const content = message && message.content;
  if (Array.isArray(content)) return content.filter(Boolean);
  return content ? [{ type: 'text', text: String(content) }] : [];
}

function coworkBlocksText(blocks) {
  return blocks.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
}

// A person's message comes from the client. Context the app adds by itself is flagged
// isSynthetic or shouldQuery false, or opens with a system-reminder tag.
function coworkIsPrompt(event, blocks) {
  const payload = event.payload || {};
  if (event.source !== 'client') return false;
  if (payload.isSynthetic || payload.shouldQuery === false) return false;
  return !/^\s*<system-reminder>/.test(coworkBlocksText(blocks));
}

// Named attachments stand in for the image blocks that carry the same pictures
function coworkPromptMessage(payload, blocks) {
  const files = (payload.file_attachments || []).map(f => ({
    file_name: f.file_name || 'file',
    file_kind: f.is_image ? 'image' : 'blob'
  }));
  const content = files.length ? blocks.filter(b => b.type !== 'image') : blocks;
  return { sender: 'human', content, files };
}

// Claude's turn collects its streamed blocks, the results of its tool calls and any
// interruption note until the person's next message
function coworkEventsToMessages(events) {
  const ordered = (events || []).slice().sort((a, b) => Number(a.sequence_num) - Number(b.sequence_num));
  const messages = [];
  const messageToolIds = new Set();
  let reply = null;
  const replyBlocks = () => {
    if (!reply) {
      reply = { sender: 'assistant', content: [] };
      messages.push(reply);
    }
    return reply.content;
  };

  for (const event of ordered) {
    const payload = event.payload || {};
    // A subagent's turns stay out; its result in the main turn carries the outcome
    if (payload.parent_tool_use_id) continue;
    const blocks = coworkBlocks(payload.message);

    if (event.event_type === 'assistant') {
      for (const block of blocks) {
        if (block.type === 'tool_use' && block.name === COWORK_MESSAGE_TOOL && block.input && block.input.message) {
          messageToolIds.add(block.id);
          replyBlocks().push({ type: 'text', text: String(block.input.message) });
        } else {
          replyBlocks().push(block);
        }
      }
      continue;
    }
    if (event.event_type !== 'user') continue;

    const results = blocks.filter(b => b.type === 'tool_result');
    if (results.length) {
      const shown = results.filter(b => !messageToolIds.has(b.tool_use_id));
      if (shown.length) replyBlocks().push(...shown);
      continue;
    }
    if (coworkIsPrompt(event, blocks)) {
      reply = null;
      messages.push(coworkPromptMessage(payload, blocks));
      continue;
    }
    // The worker's own user events are notes such as [Request interrupted by user]
    const note = coworkBlocksText(blocks).trim();
    if (event.source === 'worker' && !payload.isSynthetic && note) {
      replyBlocks().push({ type: 'text', text: `*${note}*` });
    }
  }
  return messages.filter(m => m.content.some(b => mdBlockToText(b)) || (m.files && m.files.length));
}

function coworkToMarkdown(session, events) {
  const id = (session && session.id) || '';
  let md = `# ${(session && session.title) || 'Untitled Cowork session'}\n\n`;
  md += `**Exported:** ${new Date().toISOString().split('T')[0]}  \n`;
  md += `**URL:** ${coworkSessionUrl(id)}  \n`;
  md += `**Session ID:** ${id}\n\n---\n\n`;
  return md + messagesToMarkdown(coworkEventsToMessages(events));
}
