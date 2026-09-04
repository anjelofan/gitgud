import { FakeGithub } from './server.ts';
import { resolveFakeGitHubPort } from './port.ts';

const port = resolveFakeGitHubPort();

const fake = new FakeGithub();
fake.registerUser({ token: fake.defaultToken });
await fake.listen(port);
// eslint-disable-next-line no-console
console.log(`fake github listening on http://localhost:${port.toString()}`);

process.once('SIGINT', async () => {
    await fake.close();
    process.exit(0);
});
