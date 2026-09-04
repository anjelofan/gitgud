import type { User } from '$lib/server/db/schema';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
    namespace App {
        interface Locals {
            session: {
                sessionId: string;
                user: Pick<User, 'id' | 'login' | 'avatarUrl'>;
                githubToken: string | null;
            } | null;
        }
        // interface Error {}
        // interface PageData {}
        // interface PageState {}
        // interface Platform {}
    }
}

export {};
