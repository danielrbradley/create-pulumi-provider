# POC for self-updatable Pulumi provider framework

Once deployed the process would be:

1. Run `yarn create pulumi-provider` – runs the [index.ts](index.ts) script to set up the provider with prompts. This outputs:
    - `index.ts` - starting point for a provider implementation.
    - `package.json` - minimal dependencies and scripts.
    - `schema.json` - starting point for a Pulumi schema.
    - `provider-types.d.ts` - generated types to mirror the `schema.json`.
2. Add code to the initial `index.ts` (containing initial instructions).
3. Run `yarn start`/`yarn build`/`yarn test`/`yarn generate` commands while developing the provider. This uses a reference to this package's `pulumi-provider-scripts.ts` to avoid having to bake any scripts into the repository.
4. Run `yarn update pulumi-provider-scripts` to get the latest build & development tools.
