# ASC Study DB

ASC 7주 집중 심화 스터디 문제 및 풀이 관리 시스템

멘토가 매주 문제를 출제하고, 학생들이 풀이(writeup)를 제출하면 관리자 리뷰 후 merge 시 자동으로 Notion DB에 동기화됩니다.

## 트랙

| 트랙 | 설명 |
|------|------|
| `web` | 웹 해킹 |
| `pwn` | 시스템 해킹 |
| `rev` | 리버스 엔지니어링 |
| `forensic` | 포렌식 |

## 구조

```
challenges/
└── {트랙}/
    └── week-{01~07}/
        └── {문제명}/
            ├── README.md              # 멘토: 문제 설명
            ├── challenge-files/       # 문제 파일 (바이너리, 소스 등)
            ├── 20241234_홍길동/        # 학생별 풀이 폴더
            │   ├── README.md          # 풀이 writeup
            │   └── solve.py           # exploit 코드
            └── 20241235_이영희/
                ├── README.md
                └── exploit.py
```

## 빠른 시작

### 멘토: 문제 출제

```bash
# 디렉토리 생성
mkdir -p challenges/web/week-01/sql-injection-basic/challenge-files

# 템플릿 복사
cp templates/challenge-template.md challenges/web/week-01/sql-injection-basic/README.md

# README.md 작성 + 문제 파일 추가
```

### 학생: 풀이 제출

```bash
# 레포 Fork & Clone
git clone https://github.com/<your-username>/StudyDB.git
cd StudyDB

# 풀이 디렉토리 생성
mkdir -p challenges/web/week-01/sql-injection-basic/20241234_홍길동

# 템플릿 복사
cp templates/solve-template.md challenges/web/week-01/sql-injection-basic/20241234_홍길동/README.md

# 풀이 작성 + exploit 코드 추가
```

### 로컬 검증

```bash
pip install -r scripts/requirements.txt
python scripts/validate_frontmatter.py
```

### PR 제출

```bash
git checkout -b solve/web/week-01/sql-injection-basic
git add challenges/web/week-01/sql-injection-basic/20241234_홍길동/
git commit -m "Add solve: web/week-01/sql-injection-basic - 20241234_홍길동"
git push origin solve/web/week-01/sql-injection-basic
# GitHub에서 PR 생성
```

자세한 제출 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 참고하세요.

## 출석 기준

- 7주 중 **6주 이상** 풀이 제출 시 출석 인정
- 매주 최소 1문제 이상 풀이 제출 권장

## 파이프라인

```
[멘토/학생] -> fork/branch -> [PR 제출] -> 리뷰 -> [merge] -> [GitHub Actions] -> [Notion DB]
                                   |                              |
                             CI: frontmatter 검증         변경된 .md 파싱 -> 동기화
```

## 설정 (관리자)

### GitHub Secrets

| Secret | 설명 |
|--------|------|
| `NOTION_API_KEY` | Notion Internal Integration Token |
| `NOTION_STUDY_DB_ID` | 스터디 Notion DB ID |

### Notion DB 스키마

| 속성명 | 타입 | 비고 |
|--------|------|------|
| 제목 | Title | `{challenge_name} - {author}` |
| 분야 | Select | web / pwn / rev / forensic |
| 주차 | Number | 1-7 |
| 문제명 | Rich Text | challenge_name |
| 작성자 | Rich Text | author |
| 제출일 | Date | |
| 유형 | Select | 출제 / 풀이 |
| 난이도 | Select | easy / medium / hard (출제만) |
| CL 등급 | Select | CL1 / CL2 (풀이만) |
| 학습 주제 | Rich Text | topic (출제만) |
| 태그 | Multi-select | |
| Git 링크 | URL | GitHub blob URL |

### 브랜치 보호 규칙 (권장)

- `main` 브랜치 직접 push 금지
- PR 필수, CI 통과 필수
- 최소 1명 리뷰 승인 필수
