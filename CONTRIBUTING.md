# 스터디 제출 가이드

## 멘토: 문제 출제

### 1. 디렉토리 생성

```
challenges/{트랙}/week-{주차}/{문제명}/
```

- **트랙**: `web`, `pwn`, `rev`, `forensic`
- **주차**: `week-01` ~ `week-07`
- **문제명**: 소문자, 공백은 하이픈으로 (예: `sql-injection-basic`, `heap-overflow`)

```bash
mkdir -p challenges/web/week-01/sql-injection-basic/challenge-files
cp templates/challenge-template.md challenges/web/week-01/sql-injection-basic/README.md
```

### 2. README.md 작성

YAML frontmatter 필수 필드를 모두 작성합니다.

| 필드 | 설명 | 예시 |
|------|------|------|
| `track` | 트랙 | `web` |
| `week` | 주차 (1~7) | `1` |
| `challenge_name` | 문제명 | `SQL Injection 기초` |
| `author` | 멘토 학번_이름 | `20241234_홍길동` |
| `date` | 출제일 | `2026-04-01` |
| `difficulty` | 난이도 | `easy` |
| `topic` | 학습 주제 | `SQL Injection` |
| `tags` | 태그 (선택) | `[SQLi, Union-based]` |

#### 난이도 유효값

`easy`, `medium`, `hard`

### 3. 문제 파일 추가

`challenge-files/` 디렉토리에 바이너리, 소스코드 등 문제 파일을 추가합니다.

### 4. PR 제출

```bash
git checkout -b challenge/web/week-01/sql-injection-basic
git add challenges/web/week-01/sql-injection-basic/
git commit -m "Add challenge: web/week-01/sql-injection-basic"
git push origin challenge/web/week-01/sql-injection-basic
```

---

## 학생: 풀이 제출

### 1. Fork & Clone

이 레포를 본인 GitHub 계정으로 Fork한 뒤 Clone합니다.

```bash
git clone https://github.com/<your-username>/StudyDB.git
cd StudyDB
```

### 2. 풀이 디렉토리 생성

문제 디렉토리 안에 `{학번_이름}/` 폴더를 생성합니다.

```bash
mkdir -p challenges/web/week-01/sql-injection-basic/20241234_홍길동
cp templates/solve-template.md challenges/web/week-01/sql-injection-basic/20241234_홍길동/README.md
```

### 3. 풀이 작성

YAML frontmatter 필수 필드를 모두 작성합니다.

| 필드 | 설명 | 예시 |
|------|------|------|
| `track` | 트랙 | `web` |
| `week` | 주차 (1~7) | `1` |
| `challenge_name` | 문제명 | `SQL Injection 기초` |
| `author` | 학번_이름 | `20241234_홍길동` |
| `date` | 제출일 | `2026-04-03` |
| `cl_level` | CL 등급 | `CL1` |
| `tags` | 태그 (선택) | `[SQLi, Union-based]` |

#### CL 등급 유효값

`CL1`, `CL2`

### 4. exploit 코드 추가

풀이 폴더에 `solve.py`, `exploit.py` 등 exploit 코드를 자유롭게 첨부합니다.

### 5. 로컬 검증

```bash
pip install -r scripts/requirements.txt
python scripts/validate_frontmatter.py
```

### 6. Commit & Push

```bash
git checkout -b solve/web/week-01/sql-injection-basic
git add challenges/web/week-01/sql-injection-basic/20241234_홍길동/
git commit -m "Add solve: web/week-01/sql-injection-basic - 20241234_홍길동"
git push origin solve/web/week-01/sql-injection-basic
```

### 7. Pull Request

GitHub에서 PR을 생성합니다. PR 템플릿을 채워주세요.

## 주의사항

- `author` 필드와 풀이 폴더명은 반드시 일치해야 합니다
- frontmatter 검증 CI가 통과해야 merge 가능
- 대용량 바이너리 파일은 가급적 첨부하지 않기
- 스크린샷은 풀이 폴더 내 `images/` 디렉토리에 저장
- 상대 경로 이미지는 Notion 동기화 시 GitHub raw URL로 자동 변환됩니다
