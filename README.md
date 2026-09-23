# Formly 3.0 — Multi-user authentication

This version adds account-based login and isolates each user's profile data.

## Data layout

```text
server/data/
├── users.json
└── users/
    └── <user-uuid>/
        ├── profile.json
        ├── history.json
        └── sessions.json
```

A new account creates its own UUID directory. User A can only access the files belonging to User A because every protected API route derives the user ID from the signed authentication token.

## Run locally

1. Put the project in your Formly folder.
2. Open PowerShell in `server`.
3. Run:

```powershell
npm.cmd install
$env:JWT_SECRET="replace-with-a-long-random-secret"
npm.cmd start
```

4. Open `http://localhost:3000`.
5. Create an account.
6. Save the profile. It will be written to that user's UUID folder.

## Extension

Load the `extension` folder as an unpacked Chrome extension. Sign in to the extension once with the same Formly account. It then uses the account token to request only that user's pending autofill session.

## Publishing

For production, deploy the Node server behind HTTPS and change the extension's `API` constant in `background.js` and `popup.js` from `http://localhost:3000` to your API domain, for example `https://api.example.com`.

Set a strong `JWT_SECRET` and configure `CORS_ORIGINS` for the web and extension origins. Do not publish real user data, `users.json`, or the `server/data/users` directory as static web files.

## Security note

Passwords are hashed with bcrypt. The browser receives a signed token rather than the password. The profile is not stored in browser localStorage; only the authentication token and theme preference are kept there.

The current storage layer is intentionally file-based to match the requested "separate file per user" design. For a large public deployment, move profile/history/session records to PostgreSQL or another server-side database while keeping the same user isolation model.


## Extension
The Chrome extension does not require a separate login. Formly creates a short-lived one-time autofill session when you click Open & Autofill.


## Autofill architecture
The extension has no separate login. When Formly is open and the user is signed in, the extension receives the website authentication token and stores it in extension storage. When an external form loads, the extension requests `/api/profile` with that token. The server resolves the authenticated user ID and returns only that user's profile. The extension then reads the form and fills matching fields. No autofill session ID is placed in the external form URL.


Autofill behavior: automatic filling occurs only when a form tab is opened from Formly. Forms opened directly are not automatically filled; use the extension Fill Form Now button for manual filling.


### Tab-scoped activation
Open & Autofill is authorized by the Chrome tabId created by the extension. No URL session token is required for extension activation. The authorization remains attached to that tab until it is closed or navigated away.
