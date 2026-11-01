# lib/organize-json.js

Reads Claude's organize answer into its JSON object for the Apply Claude's Response preview.

## Loaded by

- `manifest.json` content scripts, after `lib/organize-apply.js`, with its check in `content/cf-boot.js`
- `popup/popup.html`, after `lib/organize-apply.js`

## Callers

- `content/cf-organize-modal.js` Preview Categories, which also receives the one-click answer from `content/cf-organize-auto.js`
- `popup/popup-organize-modal.js` Preview

## cfParseOrganizeJson(text)

1. Turns the Unicode spaces in `CF_JSON_SPACES` (U+00A0, U+1680, U+2000 to U+200A, U+2028, U+2029, U+202F, U+205F, U+3000) into plain spaces.
2. Removes the zero-width characters in `CF_JSON_ZERO_WIDTH` (U+200B to U+200D, U+2060, U+FEFF).
3. Parses the text from its first `{` to its last `}`, so a code block's language label or a Copy label around the JSON is left out.
4. Throws `the text box is empty` for empty text and `the JSON has no "categories" list` for JSON without a categories array.

A space inside a folder or category name that was U+00A0 becomes a plain space.

## Measurement, 2026-11-01

`JSON.parse` in Node 22 returns `Expected property name or '}' in JSON at position 3 (line 3 column 1)` for `{\n\n` followed by U+00A0, U+200B, U+202F, U+3000 or U+FEFF. That is the same message the one-click preview showed. Plain spaces and tabs at that position parse.

A test string with U+FEFF before the brace, U+00A0 indentation and inside a name, U+2028 at a line end, U+200B before a bracket, a `json` label before and a `Copy` label after was parsed by `cfParseOrganizeJson` into the expected object. The raw `JSON.parse` of the same text returned the error above.

## Removed from the callers

- `content/cf-organize-auto.js` `cfOrganizeReplyText` no longer slices the braces. The parse does it.
- Both modals' own `JSON.parse` and categories checks were replaced by this function.
