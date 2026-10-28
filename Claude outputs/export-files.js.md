# lib/export-files.js

Reads and writes markdown exports in the `chats/` subfolder of the data folder.

## writeExportFileChecked
Returns the real outcome of one write:
- `{ success: false, code: 'no-folder' }` when no handle is stored.
- `{ success: false, code: 'permission', permission, folderName }` when `queryPermission` is not `granted`.
- `{ success: false, code: 'write', error: '<name>: <message>' }` when the write itself throws.
- `{ success: true, filename }` otherwise.

`writeExportFile` keeps its boolean result for the popup and organizer callers and logs the reason when it fails.

Moved out of lib/handle-storage.js in 1.3.0.

## readExportFileChecked (1.3.9)
Returns `{ success: true, content }`, or `{ success: false, error }` with the folder state when no handle is stored, or `<name>: <message>` of the exception that stopped the read. With `maxBytes` it reads only the first `maxBytes` bytes of the file.

`readExportFile` returns the content, or null on any failure, for the callers that only need the text. Through 1.3.8 the failure reason was dropped there, and lib/folder-ops.js and organizer/viewer.js reported every failed read as "File not found".
