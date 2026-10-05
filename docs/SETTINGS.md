# GitHub App Settings

The GitHub App (Settings → Developer settings → GitHub Apps) must satisfy all of the following for sign-in, assignment acceptance, and score collection to work:

- **Callback URL** lists the browser-facing `<scheme>://<host>[:<port>]/auth/callback` for every deployment (`http://localhost:5173/auth/callback` for `pnpm dev`, `http://localhost:4173/auth/callback` for `pnpm preview`). A mismatched `redirect_uri` makes GitHub 404 the authorize page.

    The deployed stack pins the origin with `ORIGIN` in [`compose.prod.yml`](../compose.prod.yml); adapter-node cannot infer the public scheme on its own (it falls back to `https` while the proxy hop is plain `http`), so `ORIGIN` must always be the URL the browser uses — never the container address (`gitgud:3000`). Changing the public URL means updating `ORIGIN`, this callback URL, and the GitHub App registration together; with a fixed `ORIGIN`, sign-in only works from that exact origin.

- **"Request user authorization (OAuth flow) during installation"** is enabled, and the app is **made public** (Advanced → "Make this GitHub App public") — students authorize from outside the org; a private app only works for org members.
- The app has an **active installation** on the program's org — assignment repo provisioning authenticates as the installation, not a user.
- The installation's repository permissions include
    - **Administration: Read and write** (repo creation, collaborator invitations)
    - **Contents: Read and write** (branch creation)
    - **Pull requests: Read and write** (the Feedback pull request)
    - **Actions: Read-only** (workflow run events, and the completed-run listing the Refresh scores button reads)
    - **Checks: Read-only** (the check suite, its check runs, and the annotations that carry a score)
- The installation also includes the **Members: Read-only** organization permission.
- The app has an active **webhook** whose **Webhook URL** is `<origin>/api/github/webhooks` (the deployed origin, or a development tunnel — GitHub cannot deliver to `localhost`), whose **Webhook secret** matches the deployment's `GITHUB_WEBHOOK_SECRET`, and which **subscribes to the Workflow run** event.
- The **template repository** used by an assignment is flagged as a template repo ("Template repository" checkbox in the repo's settings) — GitHub 404s template-generated repo creation otherwise. Template repos need no echo workflow: the Feedback pull request heads `main`, so every student push appears in it automatically.

Troubleshooting: the first accept of an assignment can take a few seconds — GitHub materializes template-generated repositories asynchronously, and GitGud polls the first content read (up to ~4s) before recording the submission. If you see "GitHub is still setting up your assignment repository", refresh and accept again.
