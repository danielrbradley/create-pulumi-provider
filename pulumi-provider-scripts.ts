#!/usr/bin/env node
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as child_process from "child_process";
import * as yaml from "yaml";
import * as tar from "tar";
import { generateProviderTypes } from "./generate-provider-types";

const argv = process.argv.slice(2);
const command = argv[0];

const usage = `Build helpers for NodeJS Pulumi providers

Usage: pulumi-provider-scripts [command] [args]...

Commands:
build        Build the provider package to ./dist
install      Install the provider locally
init-actions Create GitHub release action
generate     Generate provider types from schema

Options:
--help   Print this help
--retain Skip deleting the temporary build directory
`;

const npmLockFilename = "package-lock.json";
const yarnLockFilename = "yarn.lock";

const npmInstall = "npm install";
const npmCi = "npm ci";
const yarnInstall = "yarn install";

const args = {
  help: argv.includes("--help"),
  retain: argv.includes("--retain"),
};

if (args.help) {
  console.log(usage);
  process.exit(0);
}

if (typeof command != "string") {
  console.error(usage);
  process.exit(1);
}

function discover() {
  const typescript = fs.existsSync("tsconfig.json");
  const lockFileType = fs.existsSync(npmLockFilename)
    ? "npm"
    : fs.existsSync(yarnLockFilename)
    ? "yarn"
    : undefined;
  const packageContent = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const name = packageContent.name;
  if (typeof name !== "string") {
    console.error("Error: name missing in package.json");
    process.exit(1);
  }
  const packageVersion = packageContent.version;
  const version = typeof packageVersion === "string" ? packageVersion : "0.0.0";
  return {
    typescript,
    lockFileType,
    name,
    version,
  } as const;
}

async function build() {
  generateProviderTypes();
  const options = discover();
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pulumi-provider-build")
  );
  try {
    if (options.typescript) {
      const runner = options.lockFileType == "yarn" ? "yarn" : "npx";
      const tscCommand = `${runner} tsc --noEmit false --outDir ${tmpDir}`;
      try {
        console.log(child_process.execSync(tscCommand, { encoding: "utf-8" }));
      } catch (err) {
        console.error((err as child_process.ExecException).message);
        process.exit(1);
      }
    }
    const packageTargetPath = path.join(tmpDir, "package.json");
    const githubRef = process.env["GITHUB_REF"];
    if (typeof githubRef === "string") {
      const tag = githubRef.replace("refs/tags/", "");
      const versionMatch = tag.match(/^v(\d+\.\d+\.\d+$)/);
      if (!versionMatch) {
        throw new Error(`Invalid version tag: ${tag}`);
      }
      const packageContent = JSON.parse(
        fs.readFileSync("package.json", "utf-8")
      );
      packageContent.version = versionMatch[1];
      fs.writeFileSync(packageTargetPath, JSON.stringify(packageContent));
    } else {
      fs.copyFileSync("package.json", packageTargetPath);
    }
    fs.copyFileSync(
      "PulumiPlugin.yaml",
      path.join(tmpDir, "PulumiPlugin.yaml")
    );
    const installOptions = {
      cwd: tmpDir,
      encoding: "utf-8",
      env: {
        ...process.env,
        NODE_ENV: "production",
      },
    } as const;
    if (options.lockFileType === "yarn") {
      fs.copyFileSync(yarnLockFilename, path.join(tmpDir, yarnLockFilename));
      console.log(child_process.execSync(yarnInstall, installOptions));
    } else if (options.lockFileType === "npm") {
      fs.copyFileSync(npmLockFilename, path.join(tmpDir, npmLockFilename));
      console.log(child_process.execSync(npmCi, installOptions));
    } else if (options.lockFileType === undefined) {
      console.log(child_process.execSync(npmInstall, installOptions));
    } else {
      throw new Error("Package manager not implemented.");
    }
    const filesToPack = fs.readdirSync(tmpDir);
    const gzipFilename = `${options.name}.tar.gz`;
    const gzipPath = path.join("dist", gzipFilename);
    fs.mkdirSync("dist", { recursive: true });
    await tar.c({ gzip: true, file: gzipPath, cwd: tmpDir }, filesToPack);
    console.log("Packaged to", path.relative(process.cwd(), gzipPath));
    return gzipPath;
  } finally {
    if (args.retain) {
      console.log("Retained build directory", tmpDir);
    } else {
      fs.rmSync(tmpDir, { recursive: true });
    }
  }
}

async function install() {
  const packedPath = await build();
  const options = discover();
  const pulumiHome = path.resolve(os.homedir(), ".pulumi");
  const pluginName = `provider-${options.name}-v${options.version}`;
  const pluginDir = path.join(pulumiHome, "plugins", pluginName);
  if (!fs.existsSync(pulumiHome)) {
    console.error(pulumiHome, "doesn't exist");
    process.exit(1);
  }
  if (fs.existsSync(pluginDir)) {
    fs.rmSync(pluginDir, { recursive: true });
  }
  fs.mkdirSync(pluginDir);
  tar.x({ file: packedPath, cwd: pluginDir });
  console.log("Installed to", pluginDir);
}

async function initActions() {
  const options = discover();
  const ghWorkflowsPath = path.join(".github", "workflows");
  fs.mkdirSync(ghWorkflowsPath, { recursive: true });
  const content = yaml.stringify({
    name: "Release",
    on: {
      push: {
        tags: ["v*.*.*", "!v*.*.*-**"],
      },
    },
    env: {
      PROVIDER: options.name,
    },
    jobs: {
      release: {
        name: "Build & release provider",
        "runs-on": "ubuntu-latest",
        steps: [
          {
            name: "Checkout Repo",
            uses: "actions/checkout@v2",
          },
          {
            name: "Setup Node",
            uses: "actions/setup-node@v2",
            with: {
              "node-version": "${{matrix.nodeversion}}",
              "registry-url": "https://registry.npmjs.org",
            },
          },
          {
            if: "github.event_name == 'pull_request'",
            name: "Install Schema Tools",
            uses: "jaxxstorm/action-install-gh-release@v1.2.0",
            with: {
              repo: "mikhailshilkov/schema-tools",
            },
          },
          {
            if: "github.event_name == 'pull_request'",
            name: "Check Schema is Valid",
            run: "schema-tools compare ${{ env.PROVIDER }} master --local-path=schema.json",
          },
          {
            name: "Restore packages",
            uses: "bahmutov/npm-install@v1",
          },
          {
            name: "Build provider",
            run: "yarn build",
          },
          {
            name: "Release",
            uses: "softprops/action-gh-release@v1",
            with: {
              files: "dist/${{ env.PROVIDER }}.tar.gz",
            },
          },
        ],
        strategy: {
          "fail-fast": true,
          matrix: {
            nodeversion: ["14.x"],
          },
        },
      },
    },
  });
  const releasePath = path.join(ghWorkflowsPath, "release.yml");
  fs.writeFileSync(releasePath, content, {
    encoding: "utf-8",
  });
  console.log("Wrote release workflow to", releasePath);
}

(async function run() {
  switch (command) {
    case "generate":
      generateProviderTypes();
      break;
    case "build":
      build();
      break;
    case "install":
      install();
      break;
    case "init-actions":
      initActions();
      break;
    default:
      console.error(usage);
      process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
