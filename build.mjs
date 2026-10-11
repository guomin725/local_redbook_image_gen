#!/usr/bin/env node
/**
 * 解析 awesome-gpt-image-2 的 README_zh.md，提取全部提示词数据，
 * 生成画廊站点使用的 data.js（以 <script> 方式内嵌数据，支持直接双击 index.html 打开）。
 *
 * 用法: node build.mjs [README_zh.md 路径]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readmePath =
  process.argv[2] ||
  path.join(__dirname, "..", "awesome-gpt-image-2", "README_zh.md");

const CATEGORY_NAMES = [
  "个人资料 / 头像",
  "社交媒体帖子",
  "信息图 / 教育视觉图",
  "YouTube 缩略图",
  "漫画 / 故事板",
  "产品营销",
  "电商主图",
  "游戏素材",
  "海报 / 传单",
  "App / 网页设计",
];

const CATEGORY_ICONS = {
  "个人资料 / 头像": "👤",
  "社交媒体帖子": "💬",
  "信息图 / 教育视觉图": "📊",
  "YouTube 缩略图": "▶️",
  "漫画 / 故事板": "🎨",
  "产品营销": "🛍️",
  "电商主图": "📦",
  "游戏素材": "🎮",
  "海报 / 传单": "🖼️",
  "App / 网页设计": "📱",
  "精选": "🔥",
};

const LANG_NAMES = { zh: "中文", en: "English", ja: "日本語" };

function parseSection(section, forcedCategory) {
  const headingRe = /^### No\. (\d+): (.+)$/gm;
  const headings = [...section.matchAll(headingRe)];
  const out = [];

  for (let i = 0; i < headings.length; i++) {
    const [, no, fullTitle] = headings[i];
    const bodyStart = headings[i].index + headings[i][0].length;
    const bodyEnd =
      i + 1 < headings.length ? headings[i + 1].index : section.length;
    const body = section.slice(bodyStart, bodyEnd);

    // 标题前缀即分类；精选条目无前缀
    let category = forcedCategory;
    let title = fullTitle.trim();
    if (!category) {
      for (const name of CATEGORY_NAMES) {
        if (title.startsWith(name + " - ")) {
          category = name;
          title = title.slice(name.length + 3).trim();
          break;
        }
      }
    }
    if (!category) category = "精选";

    const description = extractBetween(
      body,
      "#### 📖 描述",
      "#### 📝 提示词"
    ).trim();

    // 提示词正文为首个围栏代码块
    const codeMatch = body.match(/#### 📝 提示词\s*\n+```\n([\s\S]*?)\n```/);
    const promptText = codeMatch ? codeMatch[1].trim() : "";

    const images = [
      ...body.matchAll(/<img src="(https:\/\/cms-assets[^"]+)"/g),
    ].map((m) => m[1]);

    const authorMatch = body.match(/^- \*\*作者:\*\* \[([^\]]+)\]\(([^)]+)\)/m);
    const sourceMatch = body.match(/^- \*\*来源:\*\* \[([^\]]+)\]\(([^)]+)\)/m);
    const dateMatch = body.match(
      /- \*\*发布时间:\*\* (\d{4})年(\d{1,2})月(\d{1,2})日/m
    );
    const langMatch = body.match(/- \*\*多语言:\*\* (\w+)/m);
    const idMatch = body.match(/id=(\d+)/);
    const raycast = /!\[Raycast\]/.test(body);

    if (!promptText || images.length === 0) {
      console.warn(`⚠️  No.${no}「${title}」缺少提示词或图片，已跳过`);
      continue;
    }

    out.push({
      id: idMatch ? Number(idMatch[1]) : Number(no),
      no: Number(no),
      title,
      category,
      description,
      prompt: promptText,
      images,
      author: authorMatch
        ? { name: authorMatch[1], url: authorMatch[2] }
        : null,
      source: sourceMatch
        ? { label: sourceMatch[1], url: sourceMatch[2] }
        : null,
      date: dateMatch
        ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}`
        : null,
      lang: langMatch ? langMatch[1] : null,
      raycast,
    });
  }
  return out;
}

function main() {
  const raw = fs.readFileSync(readmePath, "utf-8").replace(/\r\n/g, "\n");

  const featuredStart = raw.indexOf("## 🔥 精选提示词");
  const allStart = raw.indexOf("## 📋 所有提示词");
  if (allStart === -1) throw new Error("未找到「## 📋 所有提示词」小节");

  const prompts = [];
  const seenIds = new Set();

  const sections = [];
  if (featuredStart !== -1 && featuredStart < allStart) {
    sections.push({
      text: raw.slice(featuredStart, allStart),
      category: "精选",
    });
  }
  sections.push({ text: raw.slice(allStart), category: null });

  for (const { text, category } of sections) {
    for (const p of parseSection(text, category)) {
      if (seenIds.has(p.id)) {
        console.warn(`⚠️  id ${p.id} 重复，已跳过：「${p.title}」`);
        continue;
      }
      seenIds.add(p.id);
      p.langName = LANG_NAMES[p.lang] || p.lang;
      prompts.push(p);
    }
  }

  const dataJs =
    "/* 由 build.mjs 自动生成，数据来源: YouMind-OpenLab/awesome-gpt-image-2 (CC BY 4.0) */\n" +
    "window.GALLERY_DATA = " +
    JSON.stringify({ generatedAt: new Date().toISOString(), prompts }) +
    ";\n";

  const outPath = path.join(__dirname, "data.js");
  fs.writeFileSync(outPath, dataJs, "utf-8");

  const byCat = {};
  for (const p of prompts) byCat[p.category] = (byCat[p.category] || 0) + 1;
  console.log(`✅ 解析 ${prompts.length} 条提示词 → ${outPath}`);
  console.log("   分类分布:", byCat);
  const noMeta = prompts.filter((p) => !p.author || !p.date).length;
  if (noMeta) console.warn(`⚠️  ${noMeta} 条缺少作者或日期`);
}

function extractBetween(text, startMarker, endMarker) {
  const s = text.indexOf(startMarker);
  if (s === -1) return "";
  const from = s + startMarker.length;
  const e = text.indexOf(endMarker, from);
  return e === -1 ? text.slice(from) : text.slice(from, e);
}

main();
