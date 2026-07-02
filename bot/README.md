# StudyDB Discord 제출 봇

디스코드에서 `/제출` 슬래시 커맨드로 풀이를 올리면, GitHub `main` 에 자동 커밋되고
기존 `Sync to Notion` Actions 가 실행되어 **Notion 동기화 + 출석 체크(SW{주차})** 까지 자동으로 처리됩니다.

```
학생: /제출  →  모달 입력  →  [Cloudflare Worker]  →  GitHub main 커밋
                                                          │
                                              push → Sync to Notion Actions
                                                          │
                                        Notion StudyDB 페이지 + SW{주차} ✅ (출석)
```

상시 켜둘 서버가 없어도 되도록 **Cloudflare Workers**(서버리스, 무료)로 동작합니다.

---

## 사전 준비

- Cloudflare 계정 (무료)
- Node.js 18+ (`wrangler` CLI 및 커맨드 등록 스크립트 실행용)
- GitHub Fine-grained PAT — 이 레포에 **Contents: Read and write** 권한

## 1. Discord 애플리케이션 생성

1. https://discord.com/developers/applications → **New Application**
2. **Bot** 탭에서 봇 생성, **Bot Token** 복사 (커맨드 등록에만 사용)
3. **General Information** 에서 다음 값 복사:
   - `APPLICATION ID`
   - `PUBLIC KEY`
4. **Installation / OAuth2** 에서 `applications.commands` 스코프로 서버에 초대

## 2. 의존성 설치 & 슬래시 커맨드 등록

```bash
cd bot
npm install

# /제출 커맨드 등록 (테스트 서버에 즉시 반영하려면 DISCORD_GUILD_ID 추가)
DISCORD_APPLICATION_ID=<APP_ID> \
DISCORD_BOT_TOKEN=<BOT_TOKEN> \
DISCORD_GUILD_ID=<서버ID> \
npm run register
```

## 3. Cloudflare Worker 배포

`wrangler.toml` 의 `[vars]` 값을 채웁니다:

```toml
[vars]
DISCORD_APPLICATION_ID = "<APP_ID>"
DISCORD_PUBLIC_KEY = "<PUBLIC_KEY>"
GITHUB_REPO = "ssu-asc/StudyDB"
```

비밀값(GitHub PAT)은 커밋하지 말고 secret 으로 등록:

```bash
npx wrangler login            # 브라우저로 Cloudflare 로그인
npx wrangler secret put GITHUB_TOKEN   # 프롬프트에 PAT 붙여넣기
npm run deploy
```

배포되면 `https://studydb-discord-bot.<계정>.workers.dev` URL 이 출력됩니다.

## 4. Discord 에 엔드포인트 연결

1. Developer Portal → 애플리케이션 → **General Information**
2. **Interactions Endpoint URL** 에 Worker URL 입력 후 저장
3. 저장 시 Discord 가 검증 핑을 보내며, 서명 검증이 통과해야 저장됩니다
   (`DISCORD_PUBLIC_KEY` 가 맞아야 함)

## 5. main 브랜치 설정 (중요)

봇이 `main` 에 직접 커밋해야 제출 즉시 출석이 체크됩니다. 브랜치 보호 규칙에서
"Require a pull request before merging" 을 끄거나, PAT 소유 계정에 bypass 를 허용하세요.

---

## 로컬 테스트

```bash
cp .dev.vars.example .dev.vars   # 값 채우기
npm run dev                      # wrangler dev (로컬 서버)
```

`ngrok` 등으로 터널링해 임시 Interactions Endpoint URL 로 검증할 수 있습니다.

## 동작 요약

| 단계 | 처리 |
|------|------|
| `/제출 track week cl` | 모달 팝업 (학번_이름 / 문제명 / 폴더명 / 태그 / 풀이 본문) |
| 모달 제출 | `challenges/{track}/week-NN/{slug}/{학번_이름}/README.md` 를 main 에 커밋 |
| push | `Sync to Notion` Actions → Notion 페이지 생성 + `SW{week}` 체크박스 ✅ |

## 제약

- 모달 본문은 최대 4000자입니다. 더 긴 풀이는 본문에 외부 링크(gist/블로그)를 함께 넣으세요.
- 슬래시 커맨드로는 README.md 만 커밋됩니다. exploit 코드 등 추가 파일이 필요하면 기존 PR 방식을 병행하세요.
- 폴더명(slug)은 멘토가 만든 문제 폴더명과 동일해야 합니다.
