const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const exit = process.exit.bind(process);
process.exit = function tracedExit(code) {
  if (code && process.env.OPEN_NEXT_TRACE_EXIT === "1") {
    console.error(new Error(`process.exit(${code})`).stack);
  }

  return exit(code);
};

if (process.platform === "win32") {
  const copyFileSync = fs.copyFileSync.bind(fs);

  fs.copyFileSync = function patchedCopyFileSync(source, destination, mode) {
    if (
      typeof source === "string" &&
      !fs.existsSync(source) &&
      /open-next\.config(?:\.edge)?\.mjs$/.test(source)
    ) {
      const fileName = path.basename(source);
      const fallback = findLatestOpenNextConfig(fileName);

      if (fallback) {
        return copyFileSync(fallback, destination, mode);
      }
    }

    return copyFileSync(source, destination, mode);
  };
}

function findLatestOpenNextConfig(fileName) {
  let entries = [];

  try {
    entries = fs.readdirSync(os.tmpdir(), { withFileTypes: true });
  } catch {
    return null;
  }

  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("open-next-tmp"))
    .map((entry) => {
      const dir = path.join(os.tmpdir(), entry.name);
      const candidate = path.join(dir, fileName);
      let mtimeMs = 0;

      try {
        mtimeMs = fs.statSync(dir).mtimeMs;
      } catch {
        return null;
      }

      return fs.existsSync(candidate) ? { candidate, mtimeMs } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0]?.candidate ?? null;
}