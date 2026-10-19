/**
 * Fails the compiler when a closed union gains a member that a decision does
 * not handle, and fails at runtime if an impossible value ever arrives.
 */
export function assertNever(value: never): never {
    throw new Error(`unhandled value: ${JSON.stringify(value)}`);
}
