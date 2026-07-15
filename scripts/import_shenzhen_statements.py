"""Extract the official 2026 ICPC Shenzhen PDFs into static statement JSON.

The original PDFs remain in outputs/archive-pdf/original (gitignored). The
derived, reviewable JSON and problem images are written to public so Sites can
serve them without reparsing a PDF on every page view.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pdfplumber
from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "archive-pdf" / "original"
ENGLISH_SOURCE = SOURCE / "en"
OUTPUT = ROOT / "public" / "archive-statements" / "2026-shenzhen-invitational"
ASSETS = OUTPUT / "assets"

CONTEST_ID = "2026-shenzhen-invitational"
CONTEST_NAME = "ICPC 深圳全国邀请赛"
QOJ_CONTEST_ID = 3588
CHINESE_PDF_URL = "https://sua.ac/wiki/2026-icpc-invitational-shenzhen/contest-zh.pdf"

PROBLEMS = {
    "A": (17753, "Greetings from Prof. Chen", "来自陈教授的问候", (3, 4)),
    "B": (17754, "All-Star Showdown", "全明星对抗赛", (5, 5)),
    "C": (17755, "One Item Away", "一物之差", (6, 7)),
    "D": (17756, "City Management", "城市管理", (8, 9)),
    "E": (17757, "Card Checking", "我要验牌", (10, 11)),
    "F": (17758, "Astra", "Astra", (12, 13)),
    "G": (17759, "Snake", "贪吃蛇", (14, 15)),
    "H": (17760, "Telepathy", "心灵感应", (16, 17)),
    "I": (17761, "Calendar Cubes", "日历立方体", (18, 18)),
    "J": (17762, "Crossroads", "交叉路口", (19, 19)),
    "K": (17763, "Sum and Product", "和与积", (20, 20)),
    "L": (17764, "Critical Strike", "暴击", (21, 21)),
    "M": (17765, "Night at the Museum", "博物馆奇妙夜", (22, 23)),
}

HEADING_KEYS = {
    "Input": "input",
    "Output": "output",
    "Interaction Protocol": "interaction",
    "First Run": "first-run",
    "Second Run": "second-run",
    "Game Introduction": "game-introduction",
    "Playing Rules": "playing-rules",
    "Problem": "problem",
    "Note": "note",
    "Notes": "note",
    "游戏简介": "game-introduction",
    "出牌规则": "playing-rules",
    "问题": "problem",
    "第一次运行": "first-run",
    "第二次运行": "second-run",
}

SAMPLE_HEADINGS = {"Example", "Examples"}

SECTION_LABELS = {
    "statement": {"english": "Statement", "chinese": "题目描述"},
    "input": {"english": "Input", "chinese": "输入格式"},
    "output": {"english": "Output", "chinese": "输出格式"},
    "interaction": {"english": "Interaction Protocol", "chinese": "交互协议"},
    "first-run": {"english": "First Run", "chinese": "第一次运行"},
    "second-run": {"english": "Second Run", "chinese": "第二次运行"},
    "game-introduction": {"english": "Game Introduction", "chinese": "游戏简介"},
    "playing-rules": {"english": "Playing Rules", "chinese": "出牌规则"},
    "problem": {"english": "Problem", "chinese": "问题"},
    "note": {"english": "Note", "chinese": "说明"},
}

IMAGE_CAPTIONS = {
    "A": [("CUHK-Shenzhen campus", "香港中文大学（深圳）校园", "图片中的英文校名为“香港中文大学（深圳）”。")],
    "E": [("Landlords game interface", "斗地主游戏界面", None)],
    "F": [
        ("Astra board game", "Astra 桌游", "图片中的英文 Astra 是桌游名称《Astra》。"),
        ("Example tree constellation", "样例中的树形星座", None),
    ],
    "G": [("Snake movement example", "贪吃蛇移动示例", None)],
    "I": [("Two calendar cubes displaying 16", "两个日历立方体显示数字 16", None)],
    "M": [("Geometry example for the patrol route and exhibits", "巡逻路线与展品位置的几何示例", None)],
}


def pdftotext_layout(path: Path) -> str:
    executable = shutil.which("pdftotext")
    if not executable:
        raise RuntimeError("pdftotext is required to preserve the English statement layout")
    result = subprocess.run(
        [executable, "-layout", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.replace("\r\n", "\n")


def strip_page_noise(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        value = line.rstrip().replace("\x0c", "")
        compact = value.strip()
        if re.fullmatch(r"Page\s+\d+\s+of\s+\d+", compact, re.I):
            continue
        if compact.startswith("2026 ICPC 国际大学生程序设计竞赛全国邀请赛（深圳）"):
            continue
        cleaned.append(value)
    return cleaned


def join_lines(lines: list[str], language: str) -> str:
    values = [re.sub(r"\s+", " ", line.strip()) for line in lines if line.strip()]
    if not values:
        return ""
    if language == "english":
        return clean_formula_text(" ".join(values))
    result = values[0]
    for value in values[1:]:
        separator = " " if re.search(r"[A-Za-z0-9)]$", result) and re.match(r"[A-Za-z0-9(]", value) else ""
        result += separator + value
    return clean_formula_text(result)


def clean_formula_text(value: str) -> str:
    superscripts = str.maketrans("3456789", "³⁴⁵⁶⁷⁸⁹")
    value = re.sub(r"([≤≥<>×=]\s*)10([3-9])(?!\d)", lambda match: match.group(1) + "10" + match.group(2).translate(superscripts), value)
    value = re.sub(r"((?:does not )?exceed(?:s)?|over|不超过)\s+10([3-9])(?!\d)", lambda match: match.group(1) + " 10" + match.group(2).translate(superscripts), value, flags=re.I)
    value = value.replace("998 244 353", "998244353").replace("mustpbe", "must be")
    value = value.replace("能力向量√之间", "能力向量之间")
    value = re.sub(r"\b([A-Za-z])\s+([ij])\b", lambda match: match.group(1) + {"i": "ᵢ", "j": "ⱼ"}[match.group(2)], value)
    value = re.sub(r"\)([23])(?!\d)", lambda match: ")" + {"2": "²", "3": "³"}[match.group(1)], value)
    return value


def paragraph_blocks(lines: list[str], language: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    paragraph: list[str] = []
    bullets: list[str] = []

    def flush_paragraph() -> None:
        text = join_lines(paragraph, language)
        if text:
            blocks.append({"kind": "paragraph", "text": text})
        paragraph.clear()

    def flush_bullets() -> None:
        if bullets:
            blocks.append({"kind": "bullets", "items": bullets.copy()})
        bullets.clear()

    for raw in lines + [""]:
        line = raw.strip()
        if not line:
            flush_paragraph()
            flush_bullets()
            continue
        if line.startswith("•"):
            flush_paragraph()
            flush_bullets()
            bullets.append(line[1:].strip())
            continue
        if bullets:
            # A wrapped bullet is indented in the PDF. A new sentence ending a
            # prior bullet is still more readable when kept with that bullet.
            bullets[-1] = join_lines([bullets[-1], line], language)
            continue
        paragraph.append(line)
    return blocks


def split_sections(lines: list[str], language: str) -> list[dict]:
    sections: list[dict] = []
    current_key = "statement"
    current_lines: list[str] = []

    def flush() -> None:
        nonlocal current_lines
        blocks = paragraph_blocks(current_lines, language)
        if blocks:
            sections.append({
                "key": current_key,
                "title": SECTION_LABELS[current_key][language],
                "blocks": blocks,
            })
        current_lines = []

    for raw in lines:
        compact = raw.strip()
        if compact in SAMPLE_HEADINGS:
            flush()
            current_key = "sample-skip"
            continue
        if compact in HEADING_KEYS:
            flush()
            current_key = HEADING_KEYS[compact]
            continue
        if current_key != "sample-skip":
            current_lines.append(raw)
    flush()
    return sections


def extract_sample(layout_text: str) -> dict[str, str] | None:
    lines = strip_page_noise(layout_text.splitlines())
    start = next((index for index, line in enumerate(lines) if line.strip() in SAMPLE_HEADINGS), None)
    if start is None:
        return None
    sample_lines: list[str] = []
    for line in lines[start + 1:]:
        if line.strip() in {"Note", "Notes"}:
            break
        sample_lines.append(line.rstrip())

    header_index = next((index for index, line in enumerate(sample_lines) if "standard input" in line.lower() and "standard output" in line.lower()), None)
    if header_index is None:
        transcript = "\n".join(line.strip() for line in sample_lines if line.strip()).strip()
        return {"input": transcript, "output": "", "mode": "transcript"} if transcript else None

    header = sample_lines[header_index]
    input_column = header.lower().index("standard input")
    output_column = header.lower().index("standard output")
    split_column = max(input_column + 8, (input_column + output_column) // 2)
    input_lines: list[str] = []
    output_lines: list[str] = []
    for line in sample_lines[header_index + 1:]:
        if not line.strip():
            if input_lines and input_lines[-1] != "": input_lines.append("")
            if output_lines and output_lines[-1] != "": output_lines.append("")
            continue
        input_lines.append(line[:split_column].strip())
        output_lines.append(line[split_column:].strip())

    def compact(values: list[str]) -> str:
        while values and not values[-1]: values.pop()
        while values and not values[0]: values.pop(0)
        result: list[str] = []
        for value in values:
            if value or not result or result[-1]: result.append(value)
        return "\n".join(result).strip()

    return {"input": compact(input_lines), "output": compact(output_lines), "mode": "columns"}


def english_document(path: Path, title: str) -> tuple[list[dict], dict[str, str] | None, str, str, str]:
    layout = pdftotext_layout(path)
    lines = strip_page_noise(layout.splitlines())
    time_limit = ""
    memory_limit = ""
    body: list[str] = []
    title_removed = False
    for line in lines:
        compact = re.sub(r"\s+", " ", line.strip())
        if not compact:
            body.append("")
            continue
        if not title_removed and compact == title:
            title_removed = True
            continue
        meta = re.match(r"^(Input file|Output file|Time limit|Memory limit):\s*(.*)$", compact, re.I)
        if meta:
            key, value = meta.groups()
            if key.lower().startswith("time"): time_limit = value
            if key.lower().startswith("memory"): memory_limit = value
            continue
        body.append(line)

    sample = extract_sample(layout)
    body_without_sample: list[str] = []
    skipping_sample = False
    for line in body:
        compact = line.strip()
        if compact in SAMPLE_HEADINGS:
            skipping_sample = True
            continue
        if skipping_sample and compact in {"Note", "Notes"}:
            skipping_sample = False
            body_without_sample.append(compact)
            continue
        if not skipping_sample:
            body_without_sample.append(line)
    return split_sections(body_without_sample, "english"), sample, time_limit, memory_limit, layout


def chinese_document(pdf: pdfplumber.PDF, page_range: tuple[int, int], title_zh: str) -> list[dict]:
    lines: list[str] = []
    for page_number in range(page_range[0], page_range[1] + 1):
        text = pdf.pages[page_number - 1].extract_text(x_tolerance=2, y_tolerance=4) or ""
        page_lines = strip_page_noise(text.splitlines())
        for line in page_lines:
            compact = line.strip()
            if re.match(r"^Problem\s+[A-M]\.\s*", compact):
                continue
            lines.append(line)
        lines.append("")

    body_without_sample: list[str] = []
    skipping_sample = False
    for line in lines:
        compact = line.strip()
        if compact in SAMPLE_HEADINGS:
            skipping_sample = True
            continue
        if skipping_sample and compact in {"Note", "Notes"}:
            skipping_sample = False
            body_without_sample.append("Note")
            continue
        if not skipping_sample:
            body_without_sample.append(line)
    return split_sections(body_without_sample, "chinese")


def extract_images(slot: str, path: Path) -> list[dict]:
    captions = IMAGE_CAPTIONS.get(slot, [])
    images: list[dict] = []
    reader = PdfReader(path)
    source_images = [image for page in reader.pages for image in page.images]
    for index, image in enumerate(source_images):
        suffix = Path(image.name).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
            suffix = ".png"
        filename = f"{slot}-{index + 1}{suffix}"
        (ASSETS / filename).write_bytes(image.data)
        caption_en, caption_zh, text_zh = captions[index] if index < len(captions) else (f"Problem {slot} figure {index + 1}", f"题目 {slot} 配图 {index + 1}", None)
        images.append({
            "src": f"/archive-statements/{CONTEST_ID}/assets/{filename}",
            "captionEn": caption_en,
            "captionZh": caption_zh,
            "imageTextZh": text_zh,
        })
    return images


def main() -> None:
    chinese_pdf_path = SOURCE / "2026-shenzhen-zh.pdf"
    if not chinese_pdf_path.exists():
        raise FileNotFoundError(chinese_pdf_path)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    for old in ASSETS.iterdir():
        if old.is_file(): old.unlink()

    manifest: list[dict] = []
    with pdfplumber.open(chinese_pdf_path) as chinese_pdf:
        for slot, (problem_id, title_en, title_zh, page_range) in PROBLEMS.items():
            english_pdf_path = ENGLISH_SOURCE / f"2026-shenzhen-{slot}-en.pdf"
            if not english_pdf_path.exists():
                raise FileNotFoundError(english_pdf_path)
            english_sections, sample, time_limit, memory_limit, _ = english_document(english_pdf_path, title_en)
            chinese_sections = chinese_document(chinese_pdf, page_range, title_zh)
            images = extract_images(slot, english_pdf_path)
            english_pdf_url = f"https://contest.ucup.ac/download.php?type=statement&id={problem_id}&contest_id={QOJ_CONTEST_ID}"
            payload = {
                "schemaVersion": 1,
                "contestId": CONTEST_ID,
                "contestName": CONTEST_NAME,
                "slot": slot,
                "problemId": problem_id,
                "titleEn": title_en,
                "titleZh": title_zh,
                "timeLimitText": time_limit,
                "memoryLimitText": memory_limit,
                "source": {
                    "kind": "official-pdf-extract",
                    "englishPdfUrl": english_pdf_url,
                    "chinesePdfUrl": CHINESE_PDF_URL,
                    "chinesePages": [page_range[0], page_range[1]],
                },
                "english": {"sections": english_sections},
                "chinese": {"sections": chinese_sections},
                "sample": sample,
                "images": images,
            }
            (OUTPUT / f"{slot}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            manifest.append({
                "slot": slot,
                "titleEn": title_en,
                "titleZh": title_zh,
                "path": f"/archive-statements/{CONTEST_ID}/{slot}.json",
            })

    (OUTPUT / "manifest.json").write_text(json.dumps({"contestId": CONTEST_ID, "problems": manifest}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(manifest)} statements and {len(list(ASSETS.iterdir()))} images to {OUTPUT}")


if __name__ == "__main__":
    main()
