// lib/organize-prompt.js
// Builds the Ask Claude to Organize request from the chat titles.
// Globals: CF_ORGANIZE_MAX_TITLES, CF_ORGANIZE_STOP_WORDS, analyzeChatsLocally, cfBuildOrganizePrompt
// Notes: docs/notes/lib/organize-prompt.js.md

// Titles past this count are left out of the request; their chats are matched by keywords
const CF_ORGANIZE_MAX_TITLES = 2000;

const CF_ORGANIZE_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'about', 'how', 'why', 'what', 'when',
  'where', 'this', 'that', 'your', 'new', 'can', 'you', 'help', 'need', 'want',
  'get', 'make', 'use', 'would', 'could', 'should', 'have', 'has', 'been', 'being',
  'will', 'are', 'was', 'were', 'they', 'them', 'their', 'there', 'here', 'which',
  'more', 'some', 'any', 'all', 'each', 'into', 'than', 'then', 'also', 'just',
  'like', 'know', 'think', 'does', 'did', 'doing', 'done', 'way', 'well', 'very'
]);

// The 80 most frequent title words and the 40 most frequent two-word phrases seen at least twice
function analyzeChatsLocally(chats) {
  const wordCounts = {};
  const phraseCounts = {};
  (chats || []).forEach(chat => {
    const words = (String(chat.title || '').toLowerCase().match(/\b[a-z]{3,}\b/g) || [])
      .filter(w => !CF_ORGANIZE_STOP_WORDS.has(w));
    words.forEach(word => { wordCounts[word] = (wordCounts[word] || 0) + 1; });
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      phraseCounts[bigram] = (phraseCounts[bigram] || 0) + 1;
    }
  });
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }));
  const topPhrases = Object.entries(phraseCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([phrase, count]) => ({ phrase, count }));
  return { totalChats: (chats || []).length, topWords, topPhrases };
}

// Claude gets the numbered titles to place each one in a folder, plus the frequency hints.
// index[n - 1] is the chat id of title n, which resolves the numbers in Claude's answer.
function cfBuildOrganizePrompt(chats) {
  const list = chats || [];
  const analysis = analyzeChatsLocally(list);
  const index = list.map(c => c.id);
  const numbered = list.slice(0, CF_ORGANIZE_MAX_TITLES)
    .map((c, i) => `${i + 1}. ${String(c.title || '').replace(/\s+/g, ' ').slice(0, 120)}`)
    .join('\n');

  const count = analysis.totalChats;
  // A hint line with nothing to list is left out
  const hints = [
    analysis.topWords.length ? `FREQUENT WORDS: ${analysis.topWords.map(w => w.word).join(', ')}` : null,
    analysis.topPhrases.length ? `FREQUENT PHRASES: ${analysis.topPhrases.map(p => p.phrase).join(', ')}` : null
  ].filter(Boolean);

  const prompt = `I have ${count} Claude chat title${count === 1 ? '' : 's'} to organize into folders. Each title is numbered.
${hints.length ? '\n' + hints.join('\n') + '\n' : ''}
NUMBERED TITLES:
${numbered}

Design a folder system AND assign every numbered title to a folder. Return ONLY valid JSON in this form:
{
  "categories": [
    {
      "name": "Category Name",
      "folders": [
        {"name": "Folder Name", "keywords": ["distinctive phrase", "specific term"], "chats": [12, 47, 103]}
      ]
    }
  ]
}

Rules:
- 6 to 9 categories, 2 to 5 folders each. Order the most specific category and folder first.
- keywords: 6 to 15 per folder. Strongly prefer DISTINCTIVE multi-word phrases ("global payments", "android app", "wordpress plugin") and specific nouns. Never use a generic word on its own (app, code, data, system, design, file, update, project, fix, build, error). Use one only inside a longer phrase. Keywords match whole words, case-insensitive.
- chats: the NUMBERS of the titles in that folder. Every number from 1 to ${Math.min(count, CF_ORGANIZE_MAX_TITLES)} goes in exactly one folder.
- Last category "Miscellaneous", folder "General", keywords [], chats: the numbers of the titles that fit no other folder.
- Return ONLY the JSON, no markdown, no commentary.`;

  return { prompt, index, analysis };
}
