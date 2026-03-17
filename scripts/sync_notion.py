#!/usr/bin/env python3
"""StudyDB를 Notion DB에 동기화하는 스크립트.

변경된 문제/풀이 파일의 frontmatter를 파싱하여 Notion DB에 생성/업데이트합니다.

Usage:
    python scripts/sync_notion.py challenges/.../README.md [...]

Environment:
    NOTION_API_KEY       - Notion Internal Integration Token
    NOTION_STUDY_DB_ID   - 대상 Notion Database ID
    GITHUB_REPOSITORY    - GitHub 레포 (owner/repo 형식, Actions에서 자동 설정)
    GITHUB_SERVER_URL    - GitHub 서버 URL (Actions에서 자동 설정)
"""

import os
import re
import sys
from pathlib import Path

import frontmatter
from notion_client import Client

# 학번_이름 패턴
STUDENT_DIR_PATTERN = re.compile(r"^\d+_.+$")


def get_notion_client() -> Client:
    api_key = os.environ.get("NOTION_API_KEY")
    if not api_key:
        print("Error: NOTION_API_KEY 환경변수가 설정되지 않았습니다.")
        sys.exit(1)
    return Client(auth=api_key)


def get_database_id() -> str:
    db_id = os.environ.get("NOTION_STUDY_DB_ID")
    if not db_id:
        print("Error: NOTION_STUDY_DB_ID 환경변수가 설정되지 않았습니다.")
        sys.exit(1)
    return db_id


def build_github_url(filepath: Path) -> str:
    """파일의 GitHub URL을 생성합니다."""
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        return ""
    return f"{server}/{repo}/blob/main/{filepath}"


def parse_file(filepath: Path) -> tuple[dict, str]:
    """파일의 frontmatter와 본문을 파싱합니다."""
    post = frontmatter.load(filepath)
    return post.metadata, post.content


def is_solve_readme(filepath: Path) -> bool:
    """학생 풀이 README.md인지 판별합니다."""
    return bool(STUDENT_DIR_PATTERN.match(filepath.parent.name))


def rich_text(content: str) -> list[dict]:
    """Notion rich_text 객체를 생성합니다."""
    if len(content) > 2000:
        content = content[:2000]
    return [{"type": "text", "text": {"content": content}}]


def build_raw_image_url(relative_path: str, writeup_filepath: Path) -> str:
    """상대 경로 이미지를 GitHub raw URL로 변환합니다."""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        return ""
    image_path = (writeup_filepath.parent / relative_path).as_posix()
    if "challenges/" in image_path:
        idx = image_path.index("challenges/")
        image_path = image_path[idx:]
    return f"https://raw.githubusercontent.com/{repo}/main/{image_path}"


def markdown_to_notion_blocks(md: str, writeup_filepath: Path | None = None) -> list[dict]:
    """마크다운 텍스트를 Notion 블록 리스트로 변환합니다."""
    blocks = []
    lines = md.split("\n")
    i = 0

    while i < len(lines):
        line = lines[i]

        # 빈 줄 건너뛰기
        if not line.strip():
            i += 1
            continue

        # 코드 블록
        if line.strip().startswith("```"):
            lang = line.strip().removeprefix("```").strip()
            code_lines = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code_lines.append(lines[i])
                i += 1
            i += 1  # 닫는 ``` 건너뛰기
            code_content = "\n".join(code_lines)
            if len(code_content) > 2000:
                code_content = code_content[:2000]
            blocks.append({
                "object": "block",
                "type": "code",
                "code": {
                    "rich_text": rich_text(code_content),
                    "language": lang if lang else "plain text",
                },
            })
            continue

        # 제목
        if line.startswith("### "):
            blocks.append({
                "object": "block",
                "type": "heading_3",
                "heading_3": {"rich_text": rich_text(line[4:].strip())},
            })
            i += 1
            continue

        if line.startswith("## "):
            blocks.append({
                "object": "block",
                "type": "heading_2",
                "heading_2": {"rich_text": rich_text(line[3:].strip())},
            })
            i += 1
            continue

        if line.startswith("# "):
            blocks.append({
                "object": "block",
                "type": "heading_1",
                "heading_1": {"rich_text": rich_text(line[2:].strip())},
            })
            i += 1
            continue

        # 인용문
        if line.startswith("> "):
            quote_lines = []
            while i < len(lines) and lines[i].startswith("> "):
                quote_lines.append(lines[i][2:])
                i += 1
            blocks.append({
                "object": "block",
                "type": "quote",
                "quote": {"rich_text": rich_text("\n".join(quote_lines))},
            })
            continue

        # 비순서 목록
        if re.match(r"^[-*] ", line):
            while i < len(lines) and re.match(r"^[-*] ", lines[i]):
                blocks.append({
                    "object": "block",
                    "type": "bulleted_list_item",
                    "bulleted_list_item": {"rich_text": rich_text(lines[i][2:].strip())},
                })
                i += 1
            continue

        # 순서 목록
        if re.match(r"^\d+\. ", line):
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                text = re.sub(r"^\d+\. ", "", lines[i]).strip()
                blocks.append({
                    "object": "block",
                    "type": "numbered_list_item",
                    "numbered_list_item": {"rich_text": rich_text(text)},
                })
                i += 1
            continue

        # 이미지
        img_match = re.match(r"!\[([^\]]*)\]\(([^)]+)\)", line.strip())
        if img_match:
            url = img_match.group(2)
            if not url.startswith("http") and writeup_filepath:
                url = build_raw_image_url(url, writeup_filepath)
            if url.startswith("http"):
                blocks.append({
                    "object": "block",
                    "type": "image",
                    "image": {"type": "external", "external": {"url": url}},
                })
            i += 1
            continue

        # 구분선
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", line.strip()):
            blocks.append({"object": "block", "type": "divider", "divider": {}})
            i += 1
            continue

        # 일반 텍스트 (연속된 줄을 하나의 paragraph로)
        para_lines = []
        while i < len(lines) and lines[i].strip() and not any([
            lines[i].startswith("#"),
            lines[i].startswith("> "),
            lines[i].startswith("```"),
            re.match(r"^[-*] ", lines[i]),
            re.match(r"^\d+\. ", lines[i]),
            re.match(r"^(-{3,}|\*{3,}|_{3,})$", lines[i].strip()),
            re.match(r"!\[([^\]]*)\]\(([^)]+)\)", lines[i].strip()),
        ]):
            para_lines.append(lines[i])
            i += 1
        blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {"rich_text": rich_text("\n".join(para_lines))},
        })

    # Notion API는 한 번에 최대 100개 블록
    return blocks[:100]


def find_existing_page(notion: Client, database_id: str, challenge_name: str, author: str) -> str | None:
    """문제명+작성자로 기존 Notion 페이지를 검색합니다. 있으면 page_id 반환."""
    response = notion.search(
        query=challenge_name,
        filter={"value": "page", "property": "object"},
    )
    for page in response.get("results", []):
        if page.get("parent", {}).get("database_id", "").replace("-", "") != database_id.replace("-", ""):
            continue
        props = page.get("properties", {})
        # 제목(Title) 확인: "{challenge_name} - {author}"
        title_prop = props.get("제목", {})
        title_texts = title_prop.get("title", [])
        title = title_texts[0]["plain_text"] if title_texts else ""
        expected_title = f"{challenge_name} - {author}"
        if title == expected_title:
            return page["id"]
    return None


def build_properties(metadata: dict, github_url: str, is_solve: bool) -> dict:
    """frontmatter 메타데이터를 Notion properties로 변환합니다."""
    challenge_name = metadata.get("challenge_name", "")
    author = metadata.get("author", "")
    submission_type = "풀이" if is_solve else "출제"

    properties = {
        "제목": {"title": [{"text": {"content": f"{challenge_name} - {author}"}}]},
        "분야": {"select": {"name": metadata.get("track", "")}},
        "주차": {"number": metadata.get("week")},
        "문제명": {"rich_text": [{"text": {"content": challenge_name}}]},
        "작성자": {"rich_text": [{"text": {"content": author}}]},
        "유형": {"select": {"name": submission_type}},
    }

    # 제출일
    date = metadata.get("date")
    if date:
        properties["제출일"] = {"date": {"start": str(date)}}

    # 출제 전용 필드
    if not is_solve:
        difficulty = metadata.get("difficulty")
        if difficulty:
            properties["난이도"] = {"select": {"name": difficulty}}
        topic = metadata.get("topic")
        if topic:
            properties["학습 주제"] = {"rich_text": [{"text": {"content": topic}}]}

    # 풀이 전용 필드
    if is_solve:
        cl_level = metadata.get("cl_level")
        if cl_level:
            properties["CL 등급"] = {"select": {"name": cl_level}}

    # 태그
    tags = metadata.get("tags")
    if tags and isinstance(tags, list):
        properties["태그"] = {"multi_select": [{"name": str(t)} for t in tags]}

    # Git 링크
    if github_url:
        properties["Git 링크"] = {"url": github_url}

    return properties


def clear_page_content(notion: Client, page_id: str) -> None:
    """기존 페이지의 블록을 모두 삭제합니다."""
    children = notion.blocks.children.list(block_id=page_id)
    for block in children.get("results", []):
        notion.blocks.delete(block_id=block["id"])


def sync_file(notion: Client, database_id: str, filepath: Path) -> None:
    """단일 파일을 Notion DB에 동기화합니다."""
    metadata, content = parse_file(filepath)
    challenge_name = metadata.get("challenge_name", "")
    author = metadata.get("author", "")

    if not challenge_name or not author:
        print(f"[SKIP] {filepath}: challenge_name 또는 author 누락")
        return

    is_solve = is_solve_readme(filepath)
    github_url = build_github_url(filepath)
    properties = build_properties(metadata, github_url, is_solve)
    blocks = markdown_to_notion_blocks(content, filepath)

    existing_page_id = find_existing_page(notion, database_id, challenge_name, author)

    submission_type = "풀이" if is_solve else "출제"

    if existing_page_id:
        notion.pages.update(page_id=existing_page_id, properties=properties)
        clear_page_content(notion, existing_page_id)
        if blocks:
            notion.blocks.children.append(block_id=existing_page_id, children=blocks)
        print(f"[UPDATE] ({submission_type}) {challenge_name} - {author}")
    else:
        notion.pages.create(
            parent={"database_id": database_id},
            properties=properties,
            children=blocks,
        )
        print(f"[CREATE] ({submission_type}) {challenge_name} - {author}")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: python sync_notion.py <file> [...]")
        return 1

    notion = get_notion_client()
    database_id = get_database_id()

    for filepath_str in sys.argv[1:]:
        filepath = Path(filepath_str)
        if not filepath.exists():
            print(f"[SKIP] {filepath}: 파일 없음")
            continue
        try:
            sync_file(notion, database_id, filepath)
        except Exception as e:
            print(f"[ERROR] {filepath}: {e}")
            return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
