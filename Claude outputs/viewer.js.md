# organizer/viewer.js

Opens an exported chat from the data folder in a new tab, escaping the markdown before formatting headings, bold, italics and code.

Since 1.3.9 a failed read shows `<filename> could not be read: <reason>` with the reason from `readExportFileChecked`. Through 1.3.8 every failed read showed "File not found".
