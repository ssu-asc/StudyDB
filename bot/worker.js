/**
 * StudyDB Discord 제출 봇 (Cloudflare Worker) — 심플 버전
 *
 * 흐름:
 *   멘토: /현황생성          → 각 트랙 포럼에 "📊 제출 현황" 글 (1회)
 *   멘토: /주차개설 track week → 그 포럼에 [week-N 문제] + [week-N 제출(📝버튼)] 2글
 *   출제자                   → [문제] 글에 문제·파일 자유롭게 게시
 *   학생: /등록 학번_이름     → 디코 계정 ↔ 학번_이름 매핑 (제출 전 1회)
 *   학생: 📝 제출            → 모달 없이 제출 채널에 본인+멘토만 보이는 비공개 스레드 생성
 *                             → 거기에 풀이 설명 + 파일 업로드 (상태: 검토중)
 *   멘토: ✅승인 / ❌반려     → 스레드의 검토 버튼. **승인해야 출석 인정**
 *   마감 후                  → (크론 월 00:00 KST 또는 /공개 week:N) 승인된 제출만 레포에 커밋
 *
 * 상태: KV(STUDYDB) — members / boards / prob:{track}:{week} / sub:{week}:{track}:{author}
 *
 * 환경값: DISCORD_PUBLIC_KEY / DISCORD_APPLICATION_ID / DISCORD_BOT_TOKEN(secret)
 *         GITHUB_REPO / GITHUB_TOKEN(secret)
 *         FORUM_WEB / FORUM_PWN / FORUM_FORENSIC / SUBMIT_CHANNEL / STUDY_WEEK1_DEADLINE
 *         KV: STUDYDB
 */

const TRACKS = ["web", "pwn", "forensic"];
const WEEKS = 7;
const AUTHOR_RE = /^\d+_.+$/;

const Type = { PING: 1, COMMAND: 2, COMPONENT: 3 };
const Resp = { PONG: 1, MESSAGE: 4, DEFERRED: 5 };
const EPHEMERAL = 1 << 6;
const PRIVATE_THREAD = 12;
const UA = "DiscordBot (https://github.com/ssu-asc/StudyDB, 1.0)";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("StudyDB Discord bot is running.", { status: 200 });
    }
    const body = await request.text();
    if (!(await verifySignature(request, body, env.DISCORD_PUBLIC_KEY))) {
      return new Response("Bad request signature", { status: 401 });
    }
    const interaction = JSON.parse(body);

    if (interaction.type === Type.PING) return json({ type: Resp.PONG });

    if (interaction.type === Type.COMMAND) {
      const name = interaction.data.name;
      if (name === "주차개설") return run(ctx, handleOpenWeek(interaction, env));
      if (name === "등록") return run(ctx, handleRegister(interaction, env));
      if (name === "현황생성") return run(ctx, handleCreateBoard(interaction, env));
      if (name === "공개") return run(ctx, handlePublish(interaction, env));
      if (name === "판정") return run(ctx, handleVerdict(interaction, env));
      return ephemeral("알 수 없는 명령입니다.");
    }

    if (interaction.type === Type.COMPONENT) {
      const cid = String(interaction.data.custom_id || "");
      if (cid.startsWith("solve|")) return run(ctx, handleSubmitButton(interaction, env));
      if (cid.startsWith("review|")) return run(ctx, handleReview(interaction, env));
      return ephemeral("알 수 없는 버튼입니다.");
    }

    return new Response("Unhandled interaction type", { status: 400 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(publishDueWeeks(env));
  },
};

function run(ctx, promise) {
  ctx.waitUntil(promise);
  return json({ type: Resp.DEFERRED, data: { flags: EPHEMERAL } });
}

/* ─────────────────────────── 멘토: 주차 개설 (글 2개) ─────────────────────────── */

async function handleOpenWeek(interaction, env) {
  try {
    const o = optionMap(interaction);
    const track = String(o.track || "");
    const week = parseInt(o.week, 10);
    const title = String(o.title || "").trim();

    const errors = [];
    if (!TRACKS.includes(track)) errors.push(`트랙 오류: ${track}`);
    if (!(week >= 1 && week <= WEEKS)) errors.push("주차 범위 오류");
    const forumId = forumIdFor(env, track);
    if (!forumId) errors.push(`FORUM_${track.toUpperCase()} 미설정`);
    if (errors.length) return followup(interaction, env, `❌ 실패:\n- ${errors.join("\n- ")}`);

    const label = title || `week-${pad(week)}`;
    const qRes = await discordApi(env, "POST", `/channels/${forumId}/threads`, {
      name: `[week-${pad(week)}] 문제`,
      message: { content: `**[week-${pad(week)}] ${label}**\n\n출제자가 여기에 문제와 파일을 올립니다. 질문도 이 스레드에 남겨주세요.` },
    });
    const sRes = await discordApi(env, "POST", `/channels/${forumId}/threads`, {
      name: `[week-${pad(week)}] 제출`,
      message: {
        content:
          `**[week-${pad(week)}] ${label}** 제출\n\n` +
          `아래 **📝 제출** 버튼을 누르면 본인+멘토만 보이는 비공개 스레드가 생깁니다. 거기에 풀이 설명과 **파일을 업로드**하세요.\n` +
          `(제출 전 \`/등록 학번_이름\` 한 번 필요)`,
        components: [buttonRow(`solve|${track}|${week}`)],
      },
    });
    if (!qRes.ok || !sRes.ok) {
      return followup(interaction, env, `❌ 포럼 글 생성 실패 (문제:${qRes.status} 제출:${sRes.status}). 봇 권한/채널 확인.`);
    }
    await env.STUDYDB.put(`prob:${track}:${week}`, JSON.stringify({ title: label }));
    const q = await qRes.json();
    const s = await sRes.json();
    const link = (id) => `https://discord.com/channels/${interaction.guild_id}/${id}`;
    return followup(interaction, env, `✅ week-${pad(week)} ${track} 개설\n- 문제: ${link(q.id)}\n- 제출: ${link(s.id)}`);
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

/* ─────────────────────────── 학생: 제출 (비공개 스레드) ─────────────────────────── */

async function handleSubmitButton(interaction, env) {
  try {
    const [, track, weekStr] = String(interaction.data.custom_id || "").split("|");
    const week = parseInt(weekStr, 10);
    const discordId = interaction.member?.user?.id || interaction.user?.id || "";

    const submitCh = submitChannelFor(env, track);
    if (!submitCh) return followup(interaction, env, "❌ 제출 채널이 설정되지 않았어요 (SUBMIT_CHANNEL / SUBMIT_" + track.toUpperCase() + ").");
    const author = await findAuthorByDiscord(env, discordId);
    if (!author) return followup(interaction, env, "❌ 먼저 `/등록 track:" + track + " id:학번_이름` 으로 등록해 주세요.");

    const key = `sub:${week}:${track}:${author}`;
    const existing = await kvGetJson(env, key);
    if (existing?.threadId) {
      return followup(interaction, env, `이미 제출 스레드가 있어요 → <#${existing.threadId}>\n거기에 파일을 올리면 됩니다.`);
    }

    const prob = await kvGetJson(env, `prob:${track}:${week}`);
    const challengeName = prob?.title || `week-${pad(week)}`;

    const tres = await discordApi(env, "POST", `/channels/${submitCh}/threads`, {
      name: `[week-${pad(week)}] ${track} - ${author}`.slice(0, 100),
      type: PRIVATE_THREAD,
      invitable: false,
      auto_archive_duration: 10080,
    });
    if (!tres.ok) return followup(interaction, env, `❌ 비공개 스레드 생성 실패 (${tres.status}). 봇 권한/SUBMIT_CHANNEL 확인.`);
    const thread = await tres.json();
    if (discordId) await discordApi(env, "PUT", `/channels/${thread.id}/thread-members/${discordId}`);
    await postMessage(
      env, thread.id,
      `**${challengeName}** 제출 · \`${author}\`\n여기에 풀이 설명과 **파일을 업로드**하세요. 마감 후 자동으로 레포에 정리됩니다. (본인과 멘토만 볼 수 있어요)`
    );

    // 멘토 검토용 버튼 (승인해야 출석 인정)
    await discordApi(env, "POST", `/channels/${thread.id}/messages`, {
      content: "🧑‍🏫 **멘토 검토** — 풀이를 확인한 뒤 아래 버튼을 눌러주세요. (승인해야 출석 인정)",
      components: [reviewRow(week, track, author)],
    });

    await env.STUDYDB.put(
      key,
      JSON.stringify({ challengeName, threadId: thread.id, date: kstDate(), status: "pending", published: false }),
      { metadata: { author, track, week, status: "pending" } }
    );

    if (interaction.channel_id) {
      await discordApi(env, "POST", `/channels/${interaction.channel_id}/messages`, {
        content: `📝 **${author}** 제출 시작 (week-${pad(week)}) — 멘토 검토 대기`,
      });
    }

    try {
      await ensureMember(env, author, discordId, track);
      await updateBoards(env, [[`${author}|${track}|${week}`, "pending"]]);
    } catch (e) {
      console.error("board update failed:", e.message || e);
    }

    return followup(
      interaction, env,
      `✅ 비공개 제출 스레드 생성됨 → <#${thread.id}>\n여기에 설명과 파일을 올려주세요. **멘토 승인 후 출석 인정**됩니다.`
    );
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

/* ─────────────────────────── 멘토: 승인 / 반려 ─────────────────────────── */

/** 그 채널에서 '스레드 관리' 또는 관리자 권한이 있으면 멘토로 본다. */
function isMentor(interaction) {
  try {
    const perms = BigInt(interaction.member?.permissions || "0");
    return (perms & (1n << 34n)) !== 0n || (perms & (1n << 3n)) !== 0n; // MANAGE_THREADS | ADMINISTRATOR
  } catch {
    return false;
  }
}

async function handleReview(interaction, env) {
  try {
    const parts = String(interaction.data.custom_id || "").split("|"); // review|action|week|track|author
    const action = parts[1];
    const week = parseInt(parts[2], 10);
    const track = parts[3];
    const author = parts.slice(4).join("|");

    if (!isMentor(interaction)) return followup(interaction, env, "❌ 멘토만 승인/반려할 수 있어요.");

    const key = `sub:${week}:${track}:${author}`;
    const rec = await kvGetJson(env, key);
    if (!rec) return followup(interaction, env, "❌ 제출 기록을 찾을 수 없어요.");

    rec.status = action === "approve" ? "approved" : "rejected";
    await env.STUDYDB.put(key, JSON.stringify(rec), { metadata: { author, track, week, status: rec.status } });

    const who = interaction.member?.user?.id;
    if (interaction.channel_id) {
      await discordApi(env, "POST", `/channels/${interaction.channel_id}/messages`, {
        content:
          rec.status === "approved"
            ? `✅ **승인** — 출석 인정됩니다. (검토: <@${who}>)`
            : `❌ **반려** — 보완해서 다시 올려주세요. 보완 후 멘토가 다시 승인하면 출석 인정됩니다. (검토: <@${who}>)`,
      });
    }
    await updateBoards(env);
    return followup(interaction, env, rec.status === "approved" ? "✅ 승인 완료" : "❌ 반려 완료");
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

/** /판정 — 멘토가 특정 제출을 손으로 승인/반려 (옛 제출·버튼 없는 것도 처리 가능) */
async function handleVerdict(interaction, env) {
  try {
    if (!isMentor(interaction)) return followup(interaction, env, "❌ 멘토만 판정할 수 있어요.");
    const o = optionMap(interaction);
    const track = String(o.track || "");
    const week = parseInt(o.week, 10);
    const author = String(o.id || "").trim();
    const result = String(o.result || ""); // approved | rejected
    if (!TRACKS.includes(track) || !(week >= 1 && week <= WEEKS) || !AUTHOR_RE.test(author) || !["approved", "rejected"].includes(result)) {
      return followup(interaction, env, "❌ 입력 확인: track / week(1-7) / id(학번_이름) / result");
    }
    const key = `sub:${week}:${track}:${author}`;
    const rec = await kvGetJson(env, key);
    if (!rec) return followup(interaction, env, `❌ 제출 기록 없음: ${author} · ${track} week-${pad(week)}`);

    rec.status = result;
    await env.STUDYDB.put(key, JSON.stringify(rec), { metadata: { author, track, week, status: result } });
    if (rec.threadId) {
      await discordApi(env, "POST", `/channels/${rec.threadId}/messages`, {
        content: result === "approved" ? `✅ **승인** (멘토 판정) — 출석 인정` : `❌ **반려** (멘토 판정)`,
      }).catch(() => {});
    }
    await updateBoards(env);
    return followup(interaction, env, `${result === "approved" ? "✅ 승인" : "❌ 반려"}: ${author} · ${track} week-${pad(week)}`);
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

/* ─────────────────────────── 등록 + 현황판 ─────────────────────────── */

async function handleRegister(interaction, env) {
  try {
    const o = optionMap(interaction);
    const name = String(o.id || "").trim();
    const track = String(o.track || "");
    if (!TRACKS.includes(track)) return followup(interaction, env, `❌ 트랙 오류: ${track}`);
    if (!AUTHOR_RE.test(name)) return followup(interaction, env, "❌ 형식 오류: 학번_이름 (예: 20245027_유창하)");
    const discordId = interaction.member?.user?.id || interaction.user?.id || "";
    await ensureMember(env, name, discordId, track);
    await updateBoards(env);
    return followup(interaction, env, `✅ 등록 완료: ${name} · ${track}`);
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

async function handleCreateBoard(interaction, env) {
  try {
    const { members } = await loadMembers(env);
    const status = subsMap(await listSubs(env));
    const boards = await loadBoards(env);
    const results = [];
    for (const track of TRACKS) {
      const forumId = forumIdFor(env, track);
      if (!forumId) { results.push(`- ${track}: 포럼 ID 없음 (건너뜀)`); continue; }
      if (boards[track] && (await channelExists(env, boards[track]))) { results.push(`- ${track}: 이미 있음`); continue; }
      const res = await discordApi(env, "POST", `/channels/${forumId}/threads`, {
        name: "📊 제출 현황",
        message: { content: clip(renderBoard(members, status, track), 1990) },
      });
      if (!res.ok) { results.push(`- ${track}: 생성 실패 (${res.status})`); continue; }
      boards[track] = (await res.json()).id;
      results.push(`- ${track}: ✅ https://discord.com/channels/${interaction.guild_id}/${boards[track]}`);
    }
    await saveBoards(env, boards);
    return followup(interaction, env, `현황판 생성 결과:\n${results.join("\n")}`);
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

async function updateBoards(env, extra) {
  const boards = await loadBoards(env);
  const tracks = Object.keys(boards).filter((t) => boards[t]);
  if (!tracks.length) return;
  const { members } = await loadMembers(env);
  const status = subsMap(await listSubs(env), extra);
  for (const track of tracks) {
    await discordApi(env, "PATCH", `/channels/${boards[track]}/messages/${boards[track]}`, {
      content: clip(renderBoard(members, status, track), 1990),
    });
  }
}

const MARK = { approved: "🟩", pending: "🟨", rejected: "🟥" };

function renderBoard(members, status, track) {
  const roster = members
    .filter((m) => (m.tracks || []).includes(track))
    .sort((a, b) => a.name.localeCompare(b.name));
  const head = `📊 **${track} 제출 현황** · ${roster.length}명`;
  if (!roster.length) {
    return `${head}\n\n_등록된 스터디원이 없어요. \`/등록 track:${track} id:학번_이름\`_`;
  }
  const lines = [head, `🟩 승인(출석) · 🟨 검토중 · 🟥 반려 · ⬜ 미제출 · (왼→오 W1~W${WEEKS})`, ""];
  for (const m of roster) {
    let marks = "";
    let cnt = 0;
    for (let w = 1; w <= WEEKS; w++) {
      const st = status.get(`${m.name}|${track}|${w}`);
      marks += st ? MARK[st] || "🟨" : "⬜";
      if (st === "approved") cnt++;
    }
    lines.push(`\`${m.name}\`  ${marks}  ${cnt}/${WEEKS}`);
  }
  lines.push("", `_업데이트: ${kstDateTime()}_`);
  return lines.join("\n");
}

/* ─────────────────────────── 공개(레포 반영) ─────────────────────────── */

async function handlePublish(interaction, env) {
  try {
    const week = parseInt(optionMap(interaction).week, 10);
    if (!(week >= 1 && week <= WEEKS)) return followup(interaction, env, "주차 범위 오류 (1-7)");
    const n = await publishWeek(env, week);
    return followup(interaction, env, `✅ ${week}주차 공개 완료: ${n}건 레포에 반영`);
  } catch (err) {
    return followup(interaction, env, `❌ 처리 중 오류: ${err.message || err}`);
  }
}

async function publishDueWeeks(env) {
  const w1 = env.STUDY_WEEK1_DEADLINE;
  if (!w1) return;
  const now = Date.now();
  for (let week = 1; week <= WEEKS; week++) {
    const deadline = weekDeadlineMs(w1, week);
    if (deadline && now >= deadline) {
      try {
        await publishWeek(env, week);
      } catch (e) {
        console.error(`publish week ${week} failed:`, e.message || e);
      }
    }
  }
}

async function publishWeek(env, week) {
  let cursor;
  let count = 0;
  do {
    const r = await env.STUDYDB.list({ prefix: `sub:${week}:`, cursor });
    for (const k of r.keys) {
      const raw = await env.STUDYDB.get(k.name);
      if (!raw) continue;
      const s = JSON.parse(raw);
      if (s.published) continue;
      if ((s.status || "approved") !== "approved") continue; // 멘토 승인된 것만 공개(레거시는 승인 취급)
      const p = k.name.split(":"); // sub:week:track:author
      const track = p[2];
      const author = p.slice(3).join(":");
      const { body, files } = await readThreadSubmission(env, s.threadId);
      const dir = `challenges/${track}/week-${pad(week)}/${author}`;
      const readme = buildReadme({ track, week, challengeName: s.challengeName || `week-${pad(week)}`, author, date: s.date, body, files });
      await commitFile(env, `${dir}/README.md`, readme, `Publish solve: ${track}/week-${pad(week)} - ${author}`);
      for (const f of files) {
        try {
          const buf = await (await fetch(f.url)).arrayBuffer();
          await commitBytes(env, `${dir}/${sanitize(f.filename)}`, buf, `Add file ${f.filename}: ${author}`);
        } catch (e) {
          console.error(`file commit failed ${f.filename}:`, e.message || e);
        }
      }
      s.published = true;
      await env.STUDYDB.put(k.name, JSON.stringify(s), { metadata: { author, track, week } });
      count++;
    }
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return count;
}

function weekDeadlineMs(w1, week) {
  const [y, m, d] = String(w1).split("-").map(Number);
  if (!y || !m || !d) return null;
  // 일 23:59 KST = 일 14:59 UTC
  return Date.UTC(y, m - 1, d, 14, 59, 0) + (week - 1) * 7 * 24 * 3600 * 1000;
}

async function readThreadSubmission(env, threadId) {
  const collected = [];
  let before;
  for (let guard = 0; guard < 20; guard++) {
    const q = before ? `?limit=100&before=${before}` : `?limit=100`;
    const res = await discordApi(env, "GET", `/channels/${threadId}/messages${q}`);
    if (!res.ok) break;
    const msgs = await res.json();
    if (!msgs.length) break;
    collected.push(...msgs);
    before = msgs[msgs.length - 1].id;
    if (msgs.length < 100) break;
  }
  collected.reverse(); // 시간순
  const body = [];
  const files = [];
  for (const m of collected) {
    if (m.author?.bot) continue;
    if (m.content) body.push(m.content);
    for (const a of m.attachments || []) files.push({ filename: a.filename, url: a.url });
  }
  return { body: body.join("\n\n"), files };
}

function buildReadme({ track, week, challengeName, author, date, body, files }) {
  const lines = [
    "---",
    `track: ${track}`,
    `week: ${week}`,
    `challenge_name: ${yamlStr(challengeName)}`,
    `author: ${yamlStr(author)}`,
    `date: ${date || kstDate()}`,
    "---",
    "",
    (body && body.trim()) || "_(설명 없음)_",
  ];
  if (files.length) {
    lines.push("", "## 첨부 파일");
    for (const f of files) lines.push(`- ${f.filename}`);
  }
  lines.push("");
  return lines.join("\n");
}

/* ─────────────────────────── KV 상태 ─────────────────────────── */

async function kvGetJson(env, key) {
  const v = await env.STUDYDB.get(key);
  return v ? JSON.parse(v) : null;
}

async function loadMembers(env) {
  return { members: (await kvGetJson(env, "members")) || [] };
}

async function ensureMember(env, name, discordId, track) {
  const { members } = await loadMembers(env);
  const ex = members.find((m) => m.name === name);
  if (ex) {
    let changed = false;
    if (discordId && ex.discord !== discordId) { ex.discord = discordId; changed = true; }
    if (!Array.isArray(ex.tracks)) ex.tracks = [];
    if (track && !ex.tracks.includes(track)) { ex.tracks.push(track); changed = true; }
    if (changed) await env.STUDYDB.put("members", JSON.stringify(members));
    return false;
  }
  members.push({ name, discord: discordId || "", tracks: track ? [track] : [] });
  await env.STUDYDB.put("members", JSON.stringify(members));
  return true;
}

async function findAuthorByDiscord(env, discordId) {
  if (!discordId) return null;
  const { members } = await loadMembers(env);
  return members.find((m) => m.discord === discordId)?.name || null;
}

async function loadBoards(env) {
  return (await kvGetJson(env, "boards")) || {};
}

async function saveBoards(env, boards) {
  await env.STUDYDB.put("boards", JSON.stringify(boards));
}

async function listSubs(env) {
  const out = [];
  let cursor;
  do {
    const r = await env.STUDYDB.list({ prefix: "sub:", cursor });
    out.push(...r.keys);
    cursor = r.list_complete ? undefined : r.cursor;
  } while (cursor);
  return out;
}

/** KV 키 목록 → Map("author|track|week" → status) */
function subsMap(keys, extra) {
  const map = new Map(extra || []);
  for (const k of keys) {
    const m = k.metadata || {};
    let { author, track, week, status } = m;
    if (!author || !track || week == null) {
      const p = k.name.split(":"); // sub:week:track:author
      if (p.length < 4) continue;
      week = parseInt(p[1], 10);
      track = p[2];
      author = p.slice(3).join(":");
    }
    // status 없는 기록 = 승인 기능 이전 제출 → 기존 규칙대로 승인 처리(출석 유지)
    map.set(`${author}|${track}|${week}`, status || "approved");
  }
  return map;
}

/* ─────────────────────────── GitHub ─────────────────────────── */

function ghHeaders(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "studydb-discord-bot",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function getSha(env, apiPath) {
  const res = await fetch(`${apiPath}?ref=main`, { headers: ghHeaders(env) });
  if (res.status === 200) return (await res.json()).sha;
  if (res.status === 404) return undefined;
  throw new Error(`GitHub GET ${res.status}: ${await res.text()}`);
}

async function commitFile(env, path, content, message) {
  return putContent(env, path, toBase64(content), message);
}

async function commitBytes(env, path, arrayBuffer, message) {
  return putContent(env, path, bytesToBase64(arrayBuffer), message);
}

async function putContent(env, path, base64, message) {
  const apiPath = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/${encodePath(path)}`;
  const sha = await getSha(env, apiPath);
  const res = await fetch(apiPath, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({ message, content: base64, branch: "main", ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${res.status}: ${await res.text()}`);
}

/* ─────────────────────────── Discord ─────────────────────────── */

async function discordApi(env, method, path, body) {
  const res = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "Content-Type": "application/json", "User-Agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) console.error(`Discord ${method} ${path} ${res.status}: ${await res.clone().text()}`);
  return res;
}

async function channelExists(env, id) {
  const res = await fetch(`https://discord.com/api/v10/channels/${id}`, {
    headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, "User-Agent": UA },
  });
  return res.ok;
}

async function postMessage(env, channelId, content) {
  for (const chunk of splitChunks(content, 1900)) {
    await discordApi(env, "POST", `/channels/${channelId}/messages`, { content: chunk });
  }
}

function splitChunks(s, n) {
  if (!s) return [""];
  const out = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

async function followup(interaction, env, content) {
  const url = `https://discord.com/api/v10/webhooks/${env.DISCORD_APPLICATION_ID}/${interaction.token}/messages/@original`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) console.error(`followup ${res.status}: ${await res.text()}`);
}

function buttonRow(customId) {
  return { type: 1, components: [{ type: 2, style: 1, label: "📝 제출", custom_id: customId }] };
}

function reviewRow(week, track, author) {
  return {
    type: 1,
    components: [
      { type: 2, style: 3, label: "✅ 승인", custom_id: `review|approve|${week}|${track}|${author}` },
      { type: 2, style: 4, label: "❌ 반려", custom_id: `review|reject|${week}|${track}|${author}` },
    ],
  };
}

function ephemeral(content) {
  return json({ type: Resp.MESSAGE, data: { content, flags: EPHEMERAL } });
}

function optionMap(interaction) {
  return Object.fromEntries((interaction.data.options || []).map((o) => [o.name, o.value]));
}

function forumIdFor(env, track) {
  return { web: env.FORUM_WEB, pwn: env.FORUM_PWN, forensic: env.FORUM_FORENSIC }[track];
}

function submitChannelFor(env, track) {
  const perTrack = { web: env.SUBMIT_WEB, pwn: env.SUBMIT_PWN, forensic: env.SUBMIT_FORENSIC }[track];
  return perTrack || env.SUBMIT_CHANNEL;
}

/* ─────────────────────────── util ─────────────────────────── */

async function verifySignature(request, body, publicKeyHex) {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !publicKeyHex) return false;
  try {
    const key = await crypto.subtle.importKey("raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function clip(s, n) {
  return s.length > n ? s.slice(0, n) + "\n…(생략)" : s;
}

function sanitize(name) {
  return String(name).replace(/[^\w.\-가-힣]/g, "_").slice(0, 100) || "file";
}

function yamlStr(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function kstDate() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function kstDateTime() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace("T", " ") + " KST";
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  return bytesToBase64(bytes.buffer);
}

function bytesToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function json(obj) {
  return new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });
}
