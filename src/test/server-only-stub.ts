// Vitest doesn't run through Next's webpack, where "server-only" is a real
// resolvable package that throws if pulled into a client bundle. Aliased
// here (see vitest.config.ts) purely so modules that import it for that
// safety marker — correctly, they should keep doing so — can still be
// unit-tested directly under Node.
export {};
