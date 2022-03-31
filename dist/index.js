#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const readline = require("readline");
const fs = require("fs");
const path = require("path");
const generate_provider_types_1 = require("./generate-provider-types");
const prompt = readline.createInterface(process.stdin, process.stdout);
const readme = `
# An Example Provider in Typescript

## Prerequisites

- Nodejs
- Yarn

Run \`yarn\` after checkout to restore packages. NPM can also be used, if preferred.

## Debugging locally

1. \`yarn start\` - starts the plugin
2. In a Pulumi program directory, run \`PULUMI_DEBUG_PROVIDER=ts-random:[PORT] pulumi up\` to use your local development provider.

Tip: In VSCode, run \`yarn start\` in the "JavaScript Debug Terminal" to automatically attach an enable breakpoints.

## Building

- \`yarn build\` - builds the package
- \`yarn install-plugin\` - builds and installs the provider locally

## Releasing

### Setup

Run \`yarn init-actions\` to create the recommended GitHub release workflow.

### Process

Push a tag in the format \`vx.x.x\`. This will build and create the release containing the asset.

Edit the release notes after the workflow has completed if desired.
`;
const indexTemplate = `
import * as pulumi from "@pulumi/pulumi";
import * as schema from "./schema.json";
import * as types from "./provider-types";

pulumi.provider.main(
  {
    version: require("./package.json").version ?? "0.1.0",

    create: async (urn: string, inputs: types.ExampleResourceInputs) => {
      const urnParts = urn.split("::").reverse();
      const id = urnParts[0];
      const type = urnParts[1];
      const outs: types.ExampleResourceOutputs = { result: inputs.input };
      return { id, outs };
    },

    update: async (
      id: string,
      urn: string,
      olds: types.ExampleResourceInputs,
      news: types.ExampleResourceInputs
    ) => {
      const outs = { result: news.input };
      return { outs };
    },

    delete: async (id: string, urn: string, props: any) => {
      // TODO: Implement delete
    },

    schema: JSON.stringify(schema),
  },
  process.argv.slice(2)
);
`;
const gitignore = `
### macOS ###
# General
.DS_Store
.AppleDouble
.LSOverride

# Thumbnails
._*

### Node ###
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*
.yarn-integrity
.npm
node_modules/
*.tgz
dist
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz
.pnp.*

### Windows ###
# Windows thumbnail cache files
Thumbs.db
Thumbs.db:encryptable
ehthumbs.db
ehthumbs_vista.db
# Folder config file
[Dd]esktop.ini
# Windows shortcuts
*.lnk
`;
(async function () {
    try {
        const nameArgIndex = process.argv.indexOf("--name");
        const name = nameArgIndex > 0
            ? process.argv[nameArgIndex + 1]
            : await new Promise((resolve) => prompt.question("Provider name? This will be used for your folder and package name\n> ", resolve));
        if (!name.match(/^[a-z]([a-z]|-)*[a-z]$/)) {
            console.error("Invalid provider name - must be lower case and hyphenated e.g. my-provider");
            process.exit(1);
        }
        const packageContent = {
            name,
            dependencies: {
                "@pulumi/pulumi": "^3.27.0",
            },
            devDependencies: {
                "create-pulumi-provider": "https://github.com/danielrbradley/create-pulumi-provider",
                "ts-node": "^10.7.0",
                typescript: "^4.6.3",
            },
            scripts: {
                start: "ts-node index.ts",
                build: "pulumi-provider-scripts build",
                "install-plugin": "pulumi-provider-scripts install",
                "init-actions": "pulumi-provider-scripts init-actions",
            },
        };
        const schema = {
            $schema: "https://raw.githubusercontent.com/pulumi/pulumi/master/pkg/codegen/schema/pulumi.json",
            name,
            license: "Apache-2.0",
            provider: {
                description: "Example provider",
            },
            resources: {
                [`${name}:index:ExampleResource`]: {
                    description: "Example to demonstrate inputs and outputs",
                    properties: {
                        result: {
                            type: "string",
                            description: "Example string output property",
                        },
                    },
                    required: ["result"],
                    inputProperties: {
                        input: {
                            type: "string",
                            description: "Example string input property",
                        },
                    },
                    requiredInputs: ["input"],
                },
            },
        };
        const tsconfig = {
            compilerOptions: {
                target: "ES2017",
                module: "commonjs",
                declaration: true,
                sourceMap: true,
                stripInternal: true,
                experimentalDecorators: true,
                noFallthroughCasesInSwitch: true,
                forceConsistentCasingInFileNames: true,
                strict: true,
                resolveJsonModule: true,
                noEmit: true,
            },
        };
        if (fs.existsSync(name)) {
            if (fs.readdirSync(name).length !== 0) {
                console.error("Directory is not empty, aborting");
                process.exit(1);
            }
        }
        else {
            fs.mkdirSync(name);
        }
        const writeString = (filePath, template) => fs.writeFileSync(path.join(name, filePath), template.trimStart());
        const writeJson = (filePath, data) => writeString(filePath, JSON.stringify(data, undefined, 2));
        writeJson("package.json", packageContent);
        writeJson("tsconfig.json", tsconfig);
        writeJson("schema.json", schema);
        writeString("PulumiPlugin.yaml", "runtime: nodejs\n");
        writeString("index.ts", indexTemplate);
        writeString(".gitignore", gitignore);
        writeString("README.md", readme);
        (0, generate_provider_types_1.generateProviderTypes)({ cwd: name });
        console.log("Done. Read the README.md for next instructions");
    }
    catch (e) {
        console.error(e);
        process.exitCode = 1;
    }
    finally {
        prompt.close();
    }
})();
//# sourceMappingURL=index.js.map