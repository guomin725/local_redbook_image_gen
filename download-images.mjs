#!/usr/bin/env node
/**
 * 把 data.js 里引用的远程图片全部下载到 images/ 目录，
 * 并把 data.js 中的图片路径改写为本地相对路径，使站点完全自包含。
 *
 * 已存在的文件会跳过，可重复执行（断点续传）。
 *
 * 用法: node download-images.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "data.js");
const imgDir = path.join(__dirname, "images");

const CONCURRENCY = 8;
const RETRIES = 3;

// Node fetch 在部分网络环境下会被污染的 IPv6 DNS 卡住，
// curl（已验证可达图片源）更可靠，因此用 curl 下载。
function curlDownload(url, dest) {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sSL",
        "--fail",
        "--max-time",
        "60",
        "--retry",
        "2",
        "-A",
        "Mozilla/5.0 (gallery-builder)",
        "-o",
        dest,
        url,
      ],
      { windowsHide: true },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function download(url, dest) {
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await curlDownload(url, dest);
      const size = fs.statSync(dest).size;
      if (size < 1000) throw new Error("文件过小: " + size + "B");
      return size;
    } catch (e) {
      if (fs.existsSync(dest)) fs.rmSync(dest);
      if (attempt === RETRIES) throw e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
}

function loadData() {
  const raw = fs.readFileSync(dataPath, "utf-8");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}") + 1;
  return JSON.parse(raw.slice(start, end));
}

function saveData(data) {
  fs.writeFileSync(
    dataPath,
    "/* 由 build.mjs + download-images.mjs 生成，数据来源: YouMind-OpenLab/awesome-gpt-image-2 (CC BY 4.0) */\n" +
      "window.GALLERY_DATA = " +
      JSON.stringify(data) +
      ";\n",
    "utf-8"
  );
}

function extOf(url) {
  const m = url.match(/\.(jpe?g|png|webp|gif)(?:\?|$)/i);
  return m ? "." + m[1].toLowerCase() : ".jpg";
}

async function main() {
  const data = loadData();
  fs.mkdirSync(imgDir, { recursive: true });

  // 收集所有唯一 URL → 目标文件名
  const tasks = new Map(); // url -> filename
  for (const p of data.prompts) {
    p.images.forEach((url, i) => {
      if (!tasks.has(url)) tasks.set(url, `${p.id}_${i + 1}${extOf(url)}`);
    });
  }

  console.log(`共 ${tasks.size} 张唯一图片`);
  let done = 0,
    skipped = 0,
    failed = [];

  const queue = [...tasks.entries()];
  async function worker() {
    while (queue.length) {
      const [url, filename] = queue.shift();
      const dest = path.join(imgDir, filename);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
        skipped++;
      } else {
        try {
          await download(url, dest);
        } catch (e) {
          failed.push({ url, reason: String(e.message || e) });
          continue;
        }
      }
      done++;
      if (done % 20 === 0) console.log(`  进度 ${done}/${tasks.size}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // 改写 data.js 为本地路径
  for (const p of data.prompts) {
    p.remoteImages = p.images;
    p.images = p.images.map((url) => "images/" + tasks.get(url));
  }
  saveData(data);

  console.log(`✅ 完成：新下载 ${done - skipped}，已存在 ${skipped}，失败 ${failed.length}`);
  if (failed.length) {
    console.warn("失败清单：");
    for (const f of failed) console.warn("  " + f.url + " ← " + f.reason);
    console.warn("重新运行本脚本可续传失败项。");
  }
  const total = fs.readdirSync(imgDir).length;
  const sizeMB =
    fs
      .readdirSync(imgDir)
      .reduce((s, f) => s + fs.statSync(path.join(imgDir, f)).size, 0) /
    1024 /
    1024;
  console.log(`images/ 目录：${total} 个文件，共 ${sizeMB.toFixed(1)} MB`);
}

main();
