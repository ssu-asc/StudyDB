#!/usr/bin/env python3
"""StudyDB frontmatter 검증 스크립트.

challenges/ 디렉토리 내 모든 README.md 파일의 YAML frontmatter를 검증합니다.
문제 출제(멘토)와 풀이(학생) README.md를 자동으로 구분하여 검증합니다.

Usage:
    python scripts/validate_frontmatter.py                              # 전체 검증
    python scripts/validate_frontmatter.py challenges/.../README.md     # 특정 파일 검증
"""

import re
import sys
from pathlib import Path

import frontmatter

VALID_TRACKS = {"web", "pwn", "rev", "forensic"}
VALID_DIFFICULTIES = {"easy", "medium", "hard"}
VALID_CL_LEVELS = {"CL1", "CL2"}

# 학번_이름 패턴: 숫자+_+이름
STUDENT_DIR_PATTERN = re.compile(r"^\d+_.+$")

CHALLENGE_REQUIRED = ["track", "week", "challenge_name", "author", "date", "difficulty", "topic"]
SOLVE_REQUIRED = ["track", "week", "challenge_name", "author", "date", "cl_level"]


def is_solve_readme(filepath: Path) -> bool:
    """학생 풀이 README.md인지 판별합니다 (부모 디렉토리가 학번_이름 패턴)."""
    return bool(STUDENT_DIR_PATTERN.match(filepath.parent.name))


def validate_common(metadata: dict, filepath: Path) -> list[str]:
    """공통 검증: track, week, tags, 경로-frontmatter 일치."""
    errors = []

    # track 유효값 검사
    track = metadata.get("track")
    if track and track not in VALID_TRACKS:
        errors.append(f"유효하지 않은 트랙: '{track}' (허용: {', '.join(sorted(VALID_TRACKS))})")

    # week 타입 및 범위 검사
    week = metadata.get("week")
    if week is not None:
        if not isinstance(week, int):
            errors.append(f"'week' 필드는 정수여야 합니다 (현재: {type(week).__name__})")
        elif not 1 <= week <= 7:
            errors.append(f"'week' 범위 초과: {week} (허용: 1~7)")

    # tags 타입 검사
    tags = metadata.get("tags")
    if tags is not None and not isinstance(tags, list):
        errors.append(f"'tags' 필드는 리스트여야 합니다 (현재: {type(tags).__name__})")

    # 경로-frontmatter 일치 검증
    parts = filepath.parts
    try:
        challenges_idx = parts.index("challenges")
        if len(parts) >= challenges_idx + 3:
            dir_track = parts[challenges_idx + 1]
            if track and dir_track != track:
                errors.append(
                    f"디렉토리 트랙 '{dir_track}'와 frontmatter 트랙 '{track}'가 불일치"
                )

            dir_week_str = parts[challenges_idx + 2]  # e.g. "week-01"
            if week is not None and isinstance(week, int):
                expected_week_dir = f"week-{week:02d}"
                if dir_week_str != expected_week_dir:
                    errors.append(
                        f"디렉토리 주차 '{dir_week_str}'와 frontmatter 주차 '{expected_week_dir}'가 불일치"
                    )
    except ValueError:
        pass  # challenges 디렉토리 외부 파일은 경로 검증 건너뜀

    return errors


def validate_challenge(metadata: dict, filepath: Path) -> list[str]:
    """문제 출제 (멘토) README.md 검증."""
    errors = []

    # 필수 필드 검사
    for field in CHALLENGE_REQUIRED:
        if field not in metadata:
            errors.append(f"필수 필드 누락: '{field}'")

    # 난이도 유효값 검사
    difficulty = metadata.get("difficulty")
    if difficulty and difficulty not in VALID_DIFFICULTIES:
        errors.append(f"유효하지 않은 난이도: '{difficulty}' (허용: {', '.join(sorted(VALID_DIFFICULTIES))})")

    errors.extend(validate_common(metadata, filepath))
    return errors


def validate_solve(metadata: dict, filepath: Path) -> list[str]:
    """풀이 (학생) README.md 검증."""
    errors = []

    # 필수 필드 검사
    for field in SOLVE_REQUIRED:
        if field not in metadata:
            errors.append(f"필수 필드 누락: '{field}'")

    # cl_level 유효값 검사
    cl_level = metadata.get("cl_level")
    if cl_level and cl_level not in VALID_CL_LEVELS:
        errors.append(f"유효하지 않은 CL 등급: '{cl_level}' (허용: {', '.join(sorted(VALID_CL_LEVELS))})")

    # 부모 폴더명 == author 일치 검증
    author = metadata.get("author")
    parent_name = filepath.parent.name
    if author and parent_name != str(author):
        errors.append(
            f"폴더명 '{parent_name}'와 frontmatter author '{author}'가 불일치"
        )

    errors.extend(validate_common(metadata, filepath))
    return errors


def validate_file(filepath: Path) -> list[str]:
    """단일 파일의 frontmatter를 검증하고 에러 목록을 반환합니다."""
    try:
        post = frontmatter.load(filepath)
    except Exception as e:
        return [f"frontmatter 파싱 실패: {e}"]

    if is_solve_readme(filepath):
        return validate_solve(post.metadata, filepath)
    else:
        return validate_challenge(post.metadata, filepath)


def find_readme_files(paths: list[str] | None = None) -> list[Path]:
    """검증할 README.md 파일 목록을 반환합니다."""
    if paths:
        return [Path(p) for p in paths if Path(p).name == "README.md"]

    repo_root = Path(__file__).resolve().parent.parent
    challenges_dir = repo_root / "challenges"
    if not challenges_dir.exists():
        return []
    return list(challenges_dir.rglob("README.md"))


def main() -> int:
    files = find_readme_files(sys.argv[1:] if len(sys.argv) > 1 else None)

    if not files:
        print("검증할 파일이 없습니다.")
        return 0

    has_errors = False

    for filepath in files:
        errors = validate_file(filepath)
        if errors:
            has_errors = True
            file_type = "풀이" if is_solve_readme(filepath) else "출제"
            print(f"\n[FAIL] ({file_type}) {filepath}")
            for err in errors:
                print(f"  - {err}")
        else:
            file_type = "풀이" if is_solve_readme(filepath) else "출제"
            print(f"[PASS] ({file_type}) {filepath}")

    if has_errors:
        print("\n검증 실패: 위 오류를 수정해주세요.")
        return 1

    print(f"\n전체 {len(files)}개 파일 검증 통과")
    return 0


if __name__ == "__main__":
    sys.exit(main())
