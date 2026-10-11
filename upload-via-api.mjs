#!/usr/bin/env node
/**
 * 通过 GitHub Git Data API 上传 images/ 下全部图片（小请求逐个上传，绕过
 * git push 大 POST 在当前网络下必败的问题），最终在远端 main 上创建单个提交。
 *
 * 可重复执行：已上传的 blob 记录在 .blob-map，重跑自动跳过。
 * 上传完成后运行 align-local.mjs 让本地 git 与远端对齐（无需下载 40MB）。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = "guomin725/local_redbook_image_gen";
const API = `https://api.github.com/repos/${REPO}`;
const PROXY = "socks5h://127.0.0.1:10808";
const IMG_DIR = path.join(__dirname, "images");
const MAP_FILE = path.join(__dirname, ".blob-map");

function getToken() {
  const r = spawnSync(
    "git",
    ["credential", "fill"],
    { input: "protocol=https\nhost=github.com\n\n", encoding: "utf-8" }
  );
  const m = r.stdout.match(/^password=(.+)$/m);
  if (!m) throw new Error("无法获取 GitHub token");
  return m[1].trim();
}

const TOKEN = getToken();

function api(method, url, body) {
  const args = [
    "-sS", "--max-time", "90",
    "-x", PROXY,
    "-X", method,
    "-H", `Authorization: token ${TOKEN}`,
    "-H", "Accept: application/vnd.github+json",
    "-H", "Content-Type: application/json",
  ];
  let tmp = null;
  if (body !== undefined) {
    tmp = path.join(__dirname, ".api-body.tmp");
    fs.writeFileSync(tmp, JSON.stringify(body));
    args.push("--data-binary", "@" + tmp);
  }
  args.push(url);
  let out, rc;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      out = execFileSync("curl", args, { encoding: "utf-8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
      rc = 0;
      break;
    } catch (e) {
      rc = e.status ?? -1;
      out = String(e.stdout || e.message);
      if (attempt < 4) await2(attempt * 700);
    }
  }
  if (tmp) fs.rmSync(tmp, { force: true });
  let json = null;
  try { json = JSON.parse(out); } catch {}
  if (rc !== 0 || !json) throw new Error(`API ${method} ${url} 失败 rc=${rc}: ${String(out).slice(0, 200)}`);
  if (json.message && !json.sha && !json.object && method !== "GET") {
    throw new Error(`API 错误: ${json.message}`);
  }
  return json;
}
function await2(ms) { spawnSync("sleep", [String(Math.ceil(ms / 1000))]); }

function loadMap() {
  const map = new Map();
  if (fs.existsSync(MAP_FILE)) {
    for (const line of fs.readFileSync(MAP_FILE, "utf-8").split("\n")) {
      const [p, s] = line.split("\t");
      if (p && s) map.set(p, s);
    }
  }
  return map;
}
function saveMapEntry(p, sha) {
  fs.appendFileSync(MAP_FILE, `${p}\t${sha}\n`);
}

function main() {
  // 1. 当前远端 main
  const ref = api("GET", `${API}/git/ref/heads/main`);
  const baseSha = ref.object.sha;
  console.log("远端 main:", baseSha);

  // 2. 逐个上传 blob
  const map = loadMap();
  const files = fs.readdirSync(IMG_DIR).sort();
  const entries = [];
  let done = 0;
  for (const f of files) {
    const rel = "images/" + f;
    let sha = map.get(rel);
    if (!sha) {
      const content = fs.readFileSync(path.join(IMG_DIR, f)).toString("base64");
      const r = api("POST", `${API}/git/blobs`, { content, encoding: "base64" });
      sha = r.sha;
      saveMapEntry(rel, sha);
    }
    entries.push({ path: rel, mode: "100644", type: "blob", sha });
    done++;
    if (done % 25 === 0) console.log(`  blob 进度 ${done}/${files.length}`);
  }
  console.log(`✅ blob 全部就绪: ${entries.length} 个`);

  // 3. 建树（基于远端当前树，只追加 images/）
  const baseCommit = api("GET", `${API}/git/commits/${baseSha}`);
  const tree = api("POST", `${API}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: entries,
  });
  console.log("新 tree:", tree.sha);

  // 4. 创建提交
  const commit = api("POST", `${API}/git/commits`, {
    message: `assets: add ${entries.length} generated images`,
    tree: tree.sha,
    parents: [baseSha],
  });
  console.log("新 commit:", commit.sha);

  // 5. 快进 main
  api("PATCH", `${API}/git/refs/heads/main`, {
    sha: commit.sha,
    force: false,
  });
  console.log("🎉 远端 main 已更新 →", commit.sha);
  console.log(`ALIGN_BASE=${baseSha}`);
  console.log(`ALIGN_COMMIT=${commit.sha}`);
}
main();
