import { FakeGithub } from './server.ts';
import { resolveFakeGitHubPort } from './port.ts';

/** Starts the fake GitHub server for the whole vitest run. */
export default function globalSetup() {
    const fake = new FakeGithub();
    fake.registerUser({ token: fake.defaultToken });
    const listen = fake.listen(resolveFakeGitHubPort());

    return async () => {
        await listen;
        await fake.close();
    };
}
