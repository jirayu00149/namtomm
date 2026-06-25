import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const command = process.argv[2] ?? "deploy";

if (process.platform === "win32" && !process.env.OPENNEXT_SUBST_DRIVE) {
  const mappedDrive = mapCurrentDirectoryToDrive();

  if (mappedDrive) {
    let exitCode = 1;

    try {
      const result = spawnSync(process.execPath, ["scripts/cloudflare.mjs", command], {
        cwd: `${mappedDrive}\\`,
        env: { ...process.env, OPENNEXT_SUBST_DRIVE: mappedDrive },
        shell: false,
        stdio: "inherit",
        windowsHide: true,
      });

      if (result.error) {
        throw result.error;
      }

      exitCode = result.status ?? 1;
    } finally {
      spawnSync("subst", [mappedDrive, "/D"], { stdio: "ignore", windowsHide: true });
    }

    process.exit(exitCode);
  }
}

const opennextBin = path.resolve(
  "node_modules",
  ".bin",
  process.platform === "win32" ? "opennextjs-cloudflare.cmd" : "opennextjs-cloudflare",
);
const preload = path.resolve("scripts", "opennext-windows-fix.cjs");

const baseEnv = {
  ...process.env,
  NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require=${preload}`].filter(Boolean).join(" "),
  NEXT_PUBLIC_SUPABASE_URL: "https://oporpiczoftpbtelssze.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_orV9VpQp0AFNfpzCoQA4HQ_1QA8yOo4",
  NEXT_PUBLIC_YOLO_STATUS: "Ready for YOLO API results",
  SUPABASE_URL: "https://oporpiczoftpbtelssze.supabase.co",
};

delete baseEnv.SUPABASE_SERVICE_ROLE_KEY;
delete baseEnv.ADMIN_API_TOKEN;
delete baseEnv.DRONE_GATEWAY_TOKEN;
delete baseEnv.WATER_INGEST_TOKEN;
delete baseEnv.YOLO_API_KEY;

try {
  if (command === "build") {
    runBuild();
  } else if (command === "preview") {
    runBuild();
    runOpenNext("preview");
  } else if (command === "deploy") {
    runBuild();
    runOpenNext("deploy");
  } else {
    throw new Error(`Unknown Cloudflare command: ${command}`);
  }
} catch (error) {
  console.error(error.message);
  process.exit(error.exitCode ?? 1);
}

function mapCurrentDirectoryToDrive() {
  const cwd = process.cwd();

  if (/^[A-Z]:\\?$/i.test(cwd)) {
    return null;
  }

  for (const letter of ["X", "Y", "Z", "W", "V", "U"]) {
    const drive = `${letter}:`;
    if (fs.existsSync(`${drive}\\`)) {
      continue;
    }

    const result = spawnSync("subst", [drive, cwd], {
      stdio: "ignore",
      windowsHide: true,
    });

    if (result.status === 0) {
      return drive;
    }
  }

  return null;
}

function runBuild() {
  withHiddenLocalEnv(() => runOpenNext("build"));
}

function withHiddenLocalEnv(task) {
  const envPath = path.resolve(".env.local");
  const backupPath = path.resolve(`.env.local.opennext-build-${process.pid}`);
  const shouldHideEnv = fs.existsSync(envPath);

  try {
    if (shouldHideEnv) {
      fs.renameSync(envPath, backupPath);
    }

    task();
  } finally {
    if (shouldHideEnv && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, envPath);
    }
  }
}

function runOpenNext(subcommand) {
  const result = spawnSync(opennextBin, [subcommand], {
    env: baseEnv,
    shell: process.platform === "win32",
    stdio: "inherit",
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const suffix = result.signal ? ` and signal ${result.signal}` : "";
    const error = new Error(`OpenNext command "${subcommand}" exited with status ${result.status ?? "null"}${suffix}.`);
    error.exitCode = result.status ?? 1;
    throw error;
  }
}