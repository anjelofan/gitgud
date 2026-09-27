# GitHub App Settings

The GitHub App (Settings → Developer settings → GitHub Apps) must satisfy all of the following for sign-in and assignment acceptance to work:

- **Callback URL** lists `<scheme>://<host>:<port>/auth/callback` for every port the app runs on (`http://localhost:5173/auth/callback` for `pnpm dev`, `http://localhost:4173/auth/callback` for `pnpm preview`). A mismatched `redirect_uri` makes GitHub 404 the authorize page.
- **"Request user authorization (OAuth flow) during installation"** is enabled, and the app is **made public** (Advanced → "Make this GitHub App public") — students authorize from outside the org; a private app only works for org members.
- The app has an **active installation** on the program's org — assignment repo provisioning authenticates as the installation, not a user.
- The installation's repository permissions include
    - **Administration: Read and write** (repo creation, collaborator invitations)
    - **Contents: Read and write** (branch creation)
    - **Pull requests: Read and write** (the Feedback pull request)
- The installation also includes the **Members: Read-only** organization permission.
- The **template repository** used by an assignment is flagged as a template repo ("Template repository" checkbox in the repo's settings) — GitHub 404s template-generated repo creation otherwise. Template repos need no echo workflow: the Feedback pull request heads `main`, so every student push appears in it automatically.

Troubleshooting: the first accept of an assignment can take a few seconds — GitHub materializes template-generated repositories asynchronously, and GitGud polls the first content read (up to ~4s) before recording the submission. If you see "GitHub is still setting up your assignment repository", refresh and accept again.
