#!/usr/bin/env node
/**
 * 슬래시 커맨드(/문제등록)를 Discord 에 등록합니다. 최초 1회 + 커맨드 변경 시 실행.
 *
 *   DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... node register-commands.js
 *
 * DISCORD_GUILD_ID 를 주면 그 서버에 즉시 반영됩니다(글로벌은 최대 1시간).
 */

const APP_ID = process.env.DISCORD_APPLICATION_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!APP_ID || !TOKEN) {
  console.error("DISCORD_APPLICATION_ID 와 DISCORD_BOT_TOKEN 환경변수가 필요합니다.");
  process.exit(1);
}

const commands = [
  {
    name: "주차개설",
    description: "트랙 포럼에 [문제]+[제출] 글을 생성합니다 (멘토용)",
    options: [
      {
        type: 3, // STRING
        name: "track",
        description: "트랙",
        required: true,
        choices: [
          { name: "web", value: "web" },
          { name: "pwn", value: "pwn" },
          { name: "forensic", value: "forensic" },
        ],
      },
      {
        type: 4, // INTEGER
        name: "week",
        description: "주차 (1-7)",
        required: true,
        choices: Array.from({ length: 7 }, (_, i) => ({ name: `${i + 1}주차`, value: i + 1 })),
      },
      {
        type: 3,
        name: "title",
        description: "주차 제목 (선택, 예: SQL Injection 기초)",
        required: false,
      },
    ],
  },
  {
    name: "등록",
    description: "해당 트랙 스터디원으로 등록합니다 (그 트랙 현황판에 추가)",
    options: [
      {
        type: 3, // STRING
        name: "track",
        description: "트랙",
        required: true,
        choices: [
          { name: "web", value: "web" },
          { name: "pwn", value: "pwn" },
          { name: "forensic", value: "forensic" },
        ],
      },
      {
        type: 3, // STRING
        name: "id",
        description: "학번_이름 (예: 20245027_유창하)",
        required: true,
      },
    ],
  },
  {
    name: "현황생성",
    description: "각 트랙 포럼에 제출 현황판을 생성합니다 (멘토용, 1회)",
  },
  {
    name: "공개",
    description: "해당 주차 제출 풀이를 레포에 공개합니다 (멘토용)",
    options: [
      {
        type: 4, // INTEGER
        name: "week",
        description: "공개할 주차 (1-7)",
        required: true,
        choices: Array.from({ length: 7 }, (_, i) => ({ name: `${i + 1}주차`, value: i + 1 })),
      },
    ],
  },
  {
    name: "판정",
    description: "특정 제출을 승인/반려합니다 (멘토용, 버튼 없는 옛 제출도 가능)",
    options: [
      {
        type: 3,
        name: "track",
        description: "트랙",
        required: true,
        choices: [
          { name: "web", value: "web" },
          { name: "pwn", value: "pwn" },
          { name: "forensic", value: "forensic" },
        ],
      },
      {
        type: 4,
        name: "week",
        description: "주차 (1-7)",
        required: true,
        choices: Array.from({ length: 7 }, (_, i) => ({ name: `${i + 1}주차`, value: i + 1 })),
      },
      {
        type: 3,
        name: "id",
        description: "학번_이름 (예: 20252718_김도형)",
        required: true,
      },
      {
        type: 3,
        name: "result",
        description: "판정",
        required: true,
        choices: [
          { name: "승인", value: "approved" },
          { name: "반려", value: "rejected" },
        ],
      },
    ],
  },
];

const url = GUILD_ID
  ? `https://discord.com/api/v10/applications/${APP_ID}/guilds/${GUILD_ID}/commands`
  : `https://discord.com/api/v10/applications/${APP_ID}/commands`;

// PUT 으로 전체 커맨드 세트를 덮어쓴다(기존 /제출 등은 제거됨).
const res = await fetch(url, {
  method: "PUT",
  headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(commands),
});

if (!res.ok) {
  console.error(`등록 실패 ${res.status}:`, await res.text());
  process.exit(1);
}

console.log(
  `✅ 커맨드 등록 완료 (${GUILD_ID ? "guild" : "global"}): ` +
    commands.map((c) => `/${c.name}`).join(", ")
);
