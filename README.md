# CraftVerse 2.0 — Smart Autofill

A local-first smart form autofill prototype with a premium neumorphism/glass UI, detailed profile vault, file-based persistence, and Chrome extension autofill.

## Start

```powershell
cd server
npm.cmd install
node server.js
```

Open:

`http://localhost:3000`

## Chrome extension

1. Open `chrome://extensions`
2. Enable Developer mode.
3. Load unpacked.
4. Select the `extension` folder.
5. Reload the extension after changes.

## Local profile storage

Profile data is stored in:

`server/data/profile.json`

Autofill history is stored in:

`server/data/history.json`

Temporary one-click autofill sessions are stored in:

`server/data/sessions.json`

## One-click autofill

Paste a form URL → Analyze → Open & Autofill. The website creates a short-lived local autofill session. The extension detects the matching newly opened tab and sends the fill command automatically.

## Security note

This is a local prototype. Sensitive information such as government IDs, bank details and documents should be encrypted and protected with authentication before public deployment.
