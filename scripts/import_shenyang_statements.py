"""Import official ICPC Shenyang regional statements.

QOJ exposes the English and official Simplified Chinese statements as
per-problem PDFs.  The source PDFs stay under outputs/ (gitignored); the
reviewable bilingual JSON and problem figures are written to public/ so a
problem opens instantly on Sites without waiting for the translation worker.
"""

from __future__ import annotations

import json
import argparse
import re
import shutil
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from pypdf import PdfReader


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "archive-pdf" / "original" / "2025-shenyang"
OUTPUT = ROOT / "public" / "archive-statements" / "2025-shenyang"
ASSETS = OUTPUT / "assets"

CONTEST_ID = "2025-shenyang"
CONTEST_NAME = "ICPC 区域赛沈阳站"
QOJ_CONTEST_ID = 2641

PROBLEMS = {
    "A": (14940, "Square Kingdom", "平方王国"),
    "B": (14941, "Buggy Painting Software I", "出 Bug 的绘画软件 I"),
    "C": (14942, "Buggy Painting Software II", "出 Bug 的绘画软件 II"),
    "D": (14943, "LED Display Renovation", "LED 显示器翻新"),
    "E": (14944, "Play It by Ear", "出奇制胜"),
    "F": (14945, "The Bond Beyond Time", "友谊地久天长"),
    "G": (14946, "Collision Damage", "碰撞伤害"),
    "H": (14947, "Cute Young Diagram Counting", "可爱的杨图计数"),
    "I": (14948, "Volunteer Simulator", "志愿者模拟器"),
    "J": (14949, "The Echoes of Chronos", "时痕回响"),
    "K": (14950, "Relay Jump", "接力跳"),
    "L": (14951, "Leo", "狮子座"),
    "M": (14952, "The End?", "大结局？"),
}

CONTEST_2024_PROBLEMS = {
    "A": (9798, "Safety First", "安全第一"),
    "B": (9799, "Magical Palette", "神奇的调色板"),
    "C": (9800, "Crisis Event: Meteorite", "突发事件：陨石"),
    "D": (9801, "Dot Product Game", "点积游戏"),
    "E": (9802, "Light Up the Grid", "点亮网格"),
    "F": (9803, "Light Up the Hypercube", "点亮超立方体"),
    "G": (9804, "Guess the Polygon", "猜测多边形"),
    "H": (9805, "Guide Map", "导览图"),
    "I": (9806, "Growing Tree", "种树"),
    "J": (9807, "Make Them Believe", "眼见为实"),
    "K": (9808, "Fragile Pinball", "易碎的弹球"),
    "L": (9809, "The Grand Contest", "大奖赛"),
    "M": (9810, "Obliviate, Then Reincarnate", "寂灭，而新生"),
}

PAGE_HEADER_PREFIX = "2025 ICPC 国际大学生程序设计竞赛亚洲区域赛（沈阳站）"
CONTEST_DATE_TEXT = "2025年11月16日"

HEADING_KEYS = {
    "Input": "input",
    "Output": "output",
    "Interaction Protocol": "interaction",
    "Note": "note",
    "Notes": "note",
}
SAMPLE_HEADINGS = {"Example", "Examples", "Sample", "Samples"}
SECTION_LABELS = {
    "statement": {"english": "Statement", "chinese": "题目描述"},
    "input": {"english": "Input", "chinese": "输入格式"},
    "output": {"english": "Output", "chinese": "输出格式"},
    "interaction": {"english": "Interaction Protocol", "chinese": "交互协议"},
    "note": {"english": "Note", "chinese": "说明"},
}

IMAGE_CAPTIONS = {
    "B": [("Sulfox creating digital art", "耳廓狐亚砜创作数字艺术", None)],
    "D": [("Standard seven-segment display layout", "标准七段数码管布局", None)],
    "F": [
        ("A valid orientation for the first sample", "第一组样例的一种合法定向", None),
        ("A valid orientation for the second sample", "第二组样例的一种合法定向", None),
    ],
    "H": [("Allowed and forbidden conjugation operations", "允许与不允许的共轭操作示意", None)],
    "K": [("The relay-jump sequence in the sample", "样例中的接力跳过程", None)],
    "L": [
        ("Leo evaluates the input RGRB", "Leo 处理输入 RGRB 的过程", "input 表示输入，output 表示输出，OR 表示三色 OR 节点。"),
        ("Leo evaluates the input BRG*", "Leo 处理输入 BRG∗ 的过程", "input 表示输入，output 表示输出，OR 表示三色 OR 节点，∗ 表示透明状态。"),
    ],
}

IMAGE_CAPTIONS_2024 = {
    "A": [
        ("A ladder with n segments and total height m", "由 n 段组成、总高度为 m 的梯子", "Ladder 表示“梯子”；d_i 表示第 i 段长度；m 表示梯子高度。"),
        ("Stable and unstable ways to connect adjacent segments", "相邻两段的稳定与不稳定连接方式", "Not stable 表示“不稳定”；Stable 表示“稳定”。"),
    ],
    "C": [("The meteorite crisis event", "陨石危机事件示意", None)],
    "F": [("The custom AI presents a higher-dimensional puzzle", "定制 AI 展示高维谜题", None)],
    "G": [("Candidate polygons for the first sample", "第一组样例的三个候选多边形", None)],
    "J": [("Eight-team single-elimination bracket", "八队单败淘汰赛赛程", "图中英文缩写为战队名称；数字表示实力值；绿色对勾表示该轮胜者。")],
    "K": [("Construction stages for the two samples", "两组样例的逐步构造过程", "Sample Case 1/2 表示第一/二组样例，后缀 0 至 3 表示构造阶段；红线表示当前加入的线段。")],
    "L": [("The interface for removing an interval", "删除时间区间的操作界面", "Removed intervals 表示“已删除区间”；ID 表示编号；From/To 表示起止时间；Duration 表示时长；new 表示新建；Add 表示添加。")],
    "M": [("Hikari's Hope Academy", "光之希望学院", "Hikari's Hope Academy 意为“光之希望学院”。")],
}

SAMPLE_OVERRIDES = {
    "A": [
        {"input": "3 1 3 1", "output": "11 3", "mode": "columns"},
        {"input": "3 2 3 1", "output": "17 3", "mode": "columns"},
        {"input": "3 3 3 1", "output": "28 3", "mode": "columns"},
        {"input": "1414215 1000000000000 1000000 1000000000000", "output": "4823373069559 1", "mode": "columns"},
    ],
    "M": [
        {
            "input": "10 80\n20 70\n30 60\n40 50\n50 40\n60 30\n70 20\n80 10",
            "output": "0.329505822460368",
            "mode": "columns",
        },
        {
            "input": "100 100\n100 100\n100 100\n100 100\n100 100\n100 100\n100 100\n100 100",
            "output": "0.125000000000000",
            "mode": "columns",
        },
    ],
}


def pdf_url(problem_id: int, chinese: bool = False) -> str:
    suffix = "&ver=zh_cn" if chinese else ""
    return f"https://contest.ucup.ac/download.php?type=statement&id={problem_id}&contest_id={QOJ_CONTEST_ID}{suffix}"


def ensure_pdf(path: Path, url: str) -> None:
    if path.exists() and path.stat().st_size > 10_000:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (icpc-trainer statement archival)"})
    for attempt in range(8):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                payload = response.read()
            if payload.startswith(b"%PDF"):
                path.write_bytes(payload)
                time.sleep(1.5)
                return
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError):
            pass
        time.sleep(min(30, 5 * (attempt + 1)))
    raise RuntimeError(f"unable to download {url}")


def pdftotext_layout(path: Path) -> str:
    executable = shutil.which("pdftotext")
    if not executable:
        raise RuntimeError("pdftotext is required to preserve statement and sample layout")
    result = subprocess.run(
        [executable, "-layout", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.stdout.replace("\r\n", "\n")


def chinese_page_range(layout: str) -> tuple[int, int] | None:
    pages = [int(value) for value in re.findall(r"Page\s+(\d+)\s+of\s+\d+", layout, re.I)]
    return (min(pages), max(pages)) if pages else None


def strip_page_noise(lines: list[str]) -> list[str]:
    cleaned: list[str] = []
    for line in lines:
        value = line.rstrip().replace("\x0c", "").replace("\x01", "")
        compact = value.strip()
        if not compact:
            cleaned.append("")
            continue
        if re.fullmatch(r"Page\s+\d+\s+of\s+\d+", compact, re.I):
            continue
        if compact.startswith(PAGE_HEADER_PREFIX):
            continue
        if compact == CONTEST_DATE_TEXT:
            continue
        cleaned.append(value)
    return cleaned


def compact_lines(values: list[str]) -> str:
    while values and not values[0].strip():
        values.pop(0)
    while values and not values[-1].strip():
        values.pop()
    result: list[str] = []
    for value in values:
        compact = value.strip()
        if compact or not result or result[-1]:
            result.append(compact)
    return "\n".join(result).strip()


def extract_samples(lines: list[str]) -> tuple[list[dict[str, str]], list[str]]:
    start = next((index for index, line in enumerate(lines) if line.strip() in SAMPLE_HEADINGS), None)
    if start is None:
        return [], lines
    end = next((index for index in range(start + 1, len(lines)) if lines[index].strip() in {"Note", "Notes"}), len(lines))
    sample_lines = lines[start + 1 : end]
    remainder = lines[:start] + lines[end:]
    header_index = next(
        (index for index, line in enumerate(sample_lines) if "standard input" in line.lower() and "standard output" in line.lower()),
        None,
    )
    if header_index is not None:
        header = sample_lines[header_index]
        input_column = header.lower().index("standard input")
        output_column = header.lower().index("standard output")
        split_column = max(input_column + 8, (input_column + output_column) // 2)
        input_lines = [line[:split_column] for line in sample_lines[header_index + 1 :]]
        output_lines = [line[split_column:] for line in sample_lines[header_index + 1 :]]
        sample = {"input": compact_lines(input_lines), "output": compact_lines(output_lines), "mode": "columns"}
        return ([sample] if sample["input"] or sample["output"] else []), remainder

    samples: list[dict[str, str]] = []
    current_input: list[str] = []
    current_output: list[str] = []
    mode = ""
    for raw in sample_lines:
        compact = raw.strip().lower()
        if compact == "standard input":
            if current_input or current_output:
                samples.append({"input": compact_lines(current_input), "output": compact_lines(current_output), "mode": "columns"})
                current_input, current_output = [], []
            mode = "input"
        elif compact == "standard output":
            mode = "output"
        elif mode == "input":
            current_input.append(raw)
        elif mode == "output":
            current_output.append(raw)
    if current_input or current_output:
        samples.append({"input": compact_lines(current_input), "output": compact_lines(current_output), "mode": "columns"})
    if samples:
        return samples, remainder
    transcript = compact_lines(sample_lines)
    return ([{"input": transcript, "output": "", "mode": "transcript"}] if transcript else []), remainder


def normalize_text(value: str, language: str) -> str:
    value = value.replace("998 244 353", "998244353")
    value = re.sub(r"10−6", r"$10^{-6}$", value)
    for exponent in (12, 9, 7, 6, 5, 4, 3):
        value = re.sub(rf"(?<!\d)10{exponent}(?!\d)", rf"$10^{{{exponent}}}$", value)
    value = re.sub(r"n\(n[−-]1\)\s+2", r"$\\frac{n(n-1)}{2}$", value)
    value = re.sub(r"\s+([,.;:!?，。；：！？、])", r"\1", value)
    value = value.replace("̸=", "≠")
    if language == "english":
        value = re.sub(r"([A-Za-z])\-\s+([a-z])", r"\1-\2", value)
        return re.sub(r"\s+", " ", value).strip()
    values = [part for part in re.split(r"\s+", value.strip()) if part]
    if not values:
        return ""
    result = values[0]
    for item in values[1:]:
        if re.search(r"[A-Za-z0-9)$]$", result) and re.match(r"[A-Za-z0-9($]", item):
            result += " " + item
        else:
            result += item
    return result


def paragraph_blocks(lines: list[str], language: str) -> list[dict]:
    blocks: list[dict] = []
    paragraph: list[str] = []
    bullets: list[str] = []

    def join(values: list[str]) -> str:
        return normalize_text(" ".join(line.strip() for line in values if line.strip()), language)

    def append_paragraph(text: str) -> None:
        if not text:
            return
        if len(text) < 520:
            blocks.append({"kind": "paragraph", "text": text})
            return
        boundary = r"(?<=[.!?])\s+(?=[A-Z])" if language == "english" else r"(?<=[。！？])(?=[^”’』」])"
        sentences = [item.strip() for item in re.split(boundary, text) if item.strip()]
        chunk = ""
        for sentence in sentences:
            separator = " " if language == "english" and chunk else ""
            if chunk and len(chunk) + len(separator) + len(sentence) > 420:
                blocks.append({"kind": "paragraph", "text": chunk})
                chunk = sentence
            else:
                chunk += separator + sentence
        if chunk:
            blocks.append({"kind": "paragraph", "text": chunk})

    def flush() -> None:
        text = join(paragraph)
        append_paragraph(text)
        paragraph.clear()
        if bullets:
            blocks.append({"kind": "bullets", "items": bullets.copy()})
        bullets.clear()

    for raw in lines + [""]:
        line = raw.strip()
        if not line:
            flush()
            continue
        if line.startswith("•"):
            if paragraph:
                text = join(paragraph)
                append_paragraph(text)
                paragraph.clear()
            bullets.append(normalize_text(line[1:].strip(), language))
            continue
        if bullets:
            bullets[-1] = normalize_text(f"{bullets[-1]} {line}", language)
        else:
            paragraph.append(line)
    return blocks


def split_sections(lines: list[str], language: str) -> list[dict]:
    sections: list[dict] = []
    key = "statement"
    body: list[str] = []

    def flush() -> None:
        nonlocal body
        blocks = paragraph_blocks(body, language)
        if blocks:
            sections.append({"key": key, "title": SECTION_LABELS[key][language], "blocks": blocks})
        body = []

    for raw in lines:
        compact = raw.strip()
        next_key = HEADING_KEYS.get(compact)
        if next_key:
            flush()
            key = next_key
        else:
            body.append(raw)
    flush()
    return sections


def replace_block(sections: list[dict], key: str, needle: str, replacement: str) -> None:
    for section in sections:
        if section["key"] != key:
            continue
        for block in section["blocks"]:
            if block["kind"] == "paragraph" and needle in block["text"]:
                block["text"] = replacement
                return


def replace_section(sections: list[dict], key: str, paragraphs: list[str]) -> None:
    section = next((item for item in sections if item["key"] == key), None)
    blocks = [{"kind": "paragraph", "text": text} for text in paragraphs]
    if section:
        section["blocks"] = blocks
    else:
        sections.append({"key": key, "title": SECTION_LABELS[key]["english"], "blocks": blocks})


def replace_section_blocks(sections: list[dict], key: str, blocks: list[dict]) -> None:
    section = next((item for item in sections if item["key"] == key), None)
    if section:
        section["blocks"] = blocks
    else:
        sections.append({"key": key, "title": SECTION_LABELS[key]["english"], "blocks": blocks})


def remove_block(sections: list[dict], key: str, needle: str) -> None:
    for section in sections:
        if section["key"] == key:
            section["blocks"] = [
                block for block in section["blocks"]
                if block["kind"] != "paragraph" or needle not in block["text"]
            ]


def proofread_2024(slot: str, language: str, sections: list[dict]) -> None:
    if slot == "A":
        replace_section_blocks(sections, "statement", [
            {"kind": "paragraph", "text": "A ladder has $n$ sections with positive integer lengths $d_1,d_2,\\ldots,d_n$ in non-increasing order: $d_1 \\ge d_2 \\ge \\cdots \\ge d_n$."},
            {"kind": "paragraph", "text": "Little Q needs a ladder whose height is exactly $m$ when stood upright, where the height is the altitude difference between its highest and lowest ends. For safety, the ladder must be stable and satisfy:"},
            {"kind": "bullets", "items": ["The lower end of the first section must touch the ground.", "For every $i=1,2,\\ldots,n-1$, the upper end of section $i$ must be locked to either the upper or lower end of section $i+1$."]},
            {"kind": "paragraph", "text": "Count the different stable ladders with $n$ sections and height exactly $m$. Two ladders are different if some section length differs, or if some section is locked to a different end of the next section. Output the answer modulo $998244353$."},
        ] if language == "english" else [
            {"kind": "paragraph", "text": "一个梯子由 $n$ 段构成，每段长度均为正整数。设各段长度依次为 $d_1,d_2,\\ldots,d_n$，则须满足 $d_1 \\ge d_2 \\ge \\cdots \\ge d_n$。"},
            {"kind": "paragraph", "text": "小 Q 需要一架竖立后高度恰好为 $m$ 的梯子；梯子的高度是最高点与最低点的海拔高度差。出于安全考虑，梯子必须稳定，并满足："},
            {"kind": "bullets", "items": ["第一段的下端必须接触地面。", "对每个 $i=1,2,\\ldots,n-1$，第 $i$ 段的上端必须锁定在第 $i+1$ 段的上端或下端。"]},
            {"kind": "paragraph", "text": "求由 $n$ 段构成且竖立高度恰好为 $m$ 的不同稳定梯子数量。若某一段的长度不同，或某一段与下一段的锁定端点不同，则两架梯子视为不同。答案对 $998244353$ 取模。"},
        ])
        replace_section(sections, "input", [
            "The first line contains $T$ ($1 \\le T \\le 10^5$), the number of test cases. Each test case contains $n$ and $m$ ($1 \\le n,m \\le 2000$), the number of sections and required height."
            if language == "english"
            else "第一行包含测试数据组数 $T$（$1 \\le T \\le 10^5$）。每组测试数据包含两个整数 $n,m$（$1 \\le n,m \\le 2000$），分别表示梯子段数和所需高度。"
        ])
        replace_section(sections, "output", [
            "For each test case, output the number of different stable ladders modulo $998244353$."
            if language == "english"
            else "对每组测试数据，输出不同稳定梯子的数量对 $998244353$ 取模后的结果。"
        ])
    elif slot == "F":
        intro_en = "Do androids dream of electric sheep? In 2040, Sulfox was enjoying the two-dimensional puzzle from Problem E when his custom AI mistook that enjoyment for a request for a greater challenge and generated an $n$-dimensional version."
        intro_zh = "仿生人会梦见电子羊吗？2040 年，耳廓狐亚砜正在体验 Problem E 中的二维谜题，他的定制 AI 却误把这种乐趣理解成对更大挑战的渴望，于是生成了一个 $n$ 维版本。"
        replace_section_blocks(sections, "statement", [
            {"kind": "paragraph", "text": intro_en if language == "english" else intro_zh},
            {"kind": "paragraph", "text": "The puzzle uses an $n$-dimensional hypercube with $2^n$ vertices, each carrying an on/off light. There are $2^n$ operations numbered from $0$ to $2^n-1$. For operation $i$:" if language == "english" else "谜题使用一个有 $2^n$ 个顶点的 $n$ 维超立方体，每个顶点有一盏开关灯。共有 $2^n$ 种操作，编号为 $0$ 到 $2^n-1$。对于操作 $i$："},
            {"kind": "bullets", "items": [
                "Its cost is $a_i$." if language == "english" else "执行代价为 $a_i$。",
                "Write $i$ in binary as $b_n b_{n-1}\\cdots b_1$. Choose any $k$-face extending exactly along the dimensions with $b_j=1$, where $k$ is the number of set bits, and toggle every light on that face." if language == "english" else "将 $i$ 的二进制表示写成 $b_n b_{n-1}\\cdots b_1$。设其中 $1$ 的个数为 $k$，任选一个恰好沿所有满足 $b_j=1$ 的维度延伸的 $k$ 维面，并切换该面上所有顶点的灯。",
            ]},
            {"kind": "paragraph", "text": "For example, operation $0$ toggles one vertex; operations $2^0,2^1,\\ldots,2^{n-1}$ toggle the endpoints of one edge in the corresponding dimension; operation $2^n-1$ toggles all lights." if language == "english" else "例如，操作 $0$ 切换单个顶点；操作 $2^0,2^1,\\ldots,2^{n-1}$ 分别切换对应维度上一条边的两个端点；操作 $2^n-1$ 切换所有灯。"},
            {"kind": "paragraph", "text": "Sulfox cannot see the current state. He only hears a prompt whenever all lights are on after an operation. Find an operation sequence that guarantees hearing the prompt for every one of the $2^{2^n}$ initial states of the $2^n$ lights, and minimize its total cost. Output the minimum cost modulo $998244353$." if language == "english" else "亚砜看不到当前状态；每当一次操作后所有灯均亮起，他才会听到提示音。请构造一个操作序列，使 $2^n$ 盏灯的 $2^{2^n}$ 种初始状态都能保证在某一步听到提示音，并最小化序列总代价。输出最小代价对 $998244353$ 取模后的结果。"},
        ])
        replace_section(sections, "input", [
            "The first line contains $T$ ($1 \\le T \\le 10^4$). For each test case, the first line contains $n$ ($2 \\le n \\le 20$); the second line contains $2^n$ integers $a_0,a_1,\\ldots,a_{2^n-1}$ ($1 \\le a_i \\le 10^6$). The sum of $2^n$ over all test cases does not exceed $2^{20}$."
            if language == "english"
            else "第一行包含测试数据组数 $T$（$1 \\le T \\le 10^4$）。每组测试数据第一行包含 $n$（$2 \\le n \\le 20$）；第二行包含 $2^n$ 个整数 $a_0,a_1,\\ldots,a_{2^n-1}$（$1 \\le a_i \\le 10^6$）。保证所有测试数据的 $2^n$ 之和不超过 $2^{20}$。"
        ])
        replace_section(sections, "output", [
            "For each test case, output the minimum total cost modulo $998244353$."
            if language == "english"
            else "对每组测试数据，输出最小总代价对 $998244353$ 取模后的结果。"
        ])


def proofread(slot: str, language: str, sections: list[dict]) -> None:
    if CONTEST_ID == "2024-shenyang":
        proofread_2024(slot, language, sections)
        return
    if CONTEST_ID != "2025-shenyang":
        return
    if slot == "A":
        replace_section(sections, "statement", [
            "In the Square Kingdom, $n$ residents numbered from $1$ to $n$ live alone on top of a tall stone pillar. The height of the pillar for the $i$-th resident is $\\left(i+\\frac{b}{a}\\right)^2$ units above the ground.",
            "Since everyone lives so high up, the only way to visit a neighbor is by using a ladder. The kingdom builds one ladder for every pair of residents. The length of each ladder is exactly the absolute difference in height between the two pillars it connects.",
            "There are $\\frac{n(n-1)}{2}$ ladders in total. Find the length of the $k$-th ladder in ascending order of length.",
        ] if language == "english" else [
            "在平方王国中，有 $n$ 名编号从 $1$ 到 $n$ 的居民各自生活在高高的石柱上。第 $i$ 名居民的石柱高度为 $\\left(i+\\frac{b}{a}\\right)^2$。",
            "由于每个人都生活得如此高，拜访邻居的唯一方式是使用梯子。王国为每对居民都建造了一个梯子，每个梯子的长度正好是所连接两根柱子高度之差的绝对值。",
            "总共有 $\\frac{n(n-1)}{2}$ 个梯子。请找出按长度升序排列的第 $k$ 个梯子的长度。",
        ])
        replace_section(sections, "input", [
            "The only line contains four integers $n$ ($2 \\le n \\le 10^{12}$), $k$ ($1 \\le k \\le \\min(\\frac{n(n-1)}{2},10^{12})$), $a$ ($1 \\le a \\le 10^6$), and $b$ ($0 \\le b \\le 10^{12}$)."
            if language == "english"
            else "仅有的一行包含四个整数 $n$（$2 \\le n \\le 10^{12}$）、$k$（$1 \\le k \\le \\min(\\frac{n(n-1)}{2},10^{12})$）、$a$（$1 \\le a \\le 10^6$）和 $b$（$0 \\le b \\le 10^{12}$）。"
        ])
        replace_section(sections, "output", [
            "Output two integers $p$ and $q$ such that the $k$-th ladder length is $p/q$, where $p \\ge 0$, $q \\ge 1$, and $\\gcd(p,q)=1$."
            if language == "english"
            else "输出两个整数 $p$ 和 $q$，表示按长度升序排列的第 $k$ 个梯子的长度为 $p/q$，其中 $p \\ge 0$、$q \\ge 1$ 且 $\\gcd(p,q)=1$。"
        ])
    elif slot == "E":
        replace_block(
            sections,
            "output",
            "fraction" if language == "english" else "最简分数",
            "For each test case, let the minimum expected number of rounds be the irreducible fraction $p/q$. Output the unique integer $r$ with $0 \\le r < 998244353$ satisfying $r q \\equiv p \\pmod{998244353}$."
            if language == "english"
            else "对于每组测试数据，设最小期望轮数为最简分数 $p/q$。输出唯一的整数 $r$，满足 $0 \\le r < 998244353$ 且 $r q \\equiv p \\pmod{998244353}$。",
        )
    elif slot == "F":
        replace_block(
            sections,
            "input",
            "four integers n" if language == "english" else "四个整数 n",
            "The first line contains four integers $n$ ($2 \\le n \\le 300$), $m$ ($n-1 \\le m \\le \\frac{n(n-1)}{2}$), $x$, and $y$ ($1 \\le x,y \\le n$, $x \\ne y$), denoting the numbers of vertices and edges and the starting vertices of Alice and Bob."
            if language == "english"
            else "第一行包含四个整数 $n$（$2 \\le n \\le 300$）、$m$（$n-1 \\le m \\le \\frac{n(n-1)}{2}$）、$x$ 和 $y$（$1 \\le x,y \\le n$，$x \\ne y$），分别表示点数、边数以及 Alice 和 Bob 的起点。",
        )
    elif slot == "G":
        replace_block(
            sections,
            "statement",
            "More formally" if language == "english" else "更正式地",
            "More formally, let $f(\\mathbf t)$ be the intersection area of $P$ and $Q$ after translating $Q$ by $\\mathbf t$. Let $D \\subseteq \\mathbb R^2$ be the set of translations with $f(\\mathbf t)>0$, and let $|D|$ denote its area. Calculate $\\frac{1}{|D|}\\int_D f(\\mathbf t)\\,d\\mathbf t$."
            if language == "english"
            else "更正式地，定义 $f(\\mathbf t)$ 为多边形 $P$ 与将多边形 $Q$ 沿 $\\mathbf t$ 平移后所得多边形的交集面积。设 $D \\subseteq \\mathbb R^2$ 为所有满足 $f(\\mathbf t)>0$ 的平移向量集合，并以 $|D|$ 表示其面积。你需要计算 $\\frac{1}{|D|}\\int_D f(\\mathbf t)\\,d\\mathbf t$。",
        )
        replace_section(sections, "output", [
            "For each test case, output the expected collision damage. The answer is accepted if $\\frac{|a-b|}{\\max(1,|b|)} \\le 10^{-6}$, where $a$ is your output and $b$ is the jury answer."
            if language == "english"
            else "对于每组测试数据，输出期望碰撞伤害。设你的输出为 $a$、标准答案为 $b$；当 $\\frac{|a-b|}{\\max(1,|b|)} \\le 10^{-6}$ 时，答案视为正确。"
        ])
    elif slot == "L":
        replace_block(
            sections,
            "statement",
            "judge will generate" if language == "english" else "评测机将生成",
            "To verify your design, the judge generates $\\left\\lceil\\frac{10^7}{n}\\right\\rceil$ valid inputs for each test. Your solution passes if Leo produces the required output for every one of them."
            if language == "english"
            else "为检验设计的正确性，每个测试点会生成 $\\left\\lceil\\frac{10^7}{n}\\right\\rceil$ 组合法输入。若 Leo 对所有输入均输出预期结果，你的方案即通过该测试点。",
        )
        remove_block(
            sections,
            "statement",
            "Your solution passes a test" if language == "english" else "若在所有输入用例中",
        )
    elif slot == "M":
        replace_block(
            sections,
            "statement",
            "strength x" if language == "english" else "强度为x",
            "When two teams meet, the team with the smaller seed uses its $a$ value and the team with the larger seed uses its $b$ value. If strengths $x$ and $y$ compete, the first team wins with probability $\\frac{x}{x+y}$. Consider every seed assignment and maximize the probability that Team 1 wins the tournament."
            if language == "english"
            else "两队交手时，种子编号较小的队伍使用其 $a$ 值，种子编号较大的队伍使用其 $b$ 值。若强度为 $x$ 的队伍与强度为 $y$ 的队伍比赛，则前者获胜的概率为 $\\frac{x}{x+y}$。你需要在所有种子分配方案中，最大化队伍 1 夺冠的概率。",
        )
        replace_section(sections, "output", [
            "Output the maximum probability that Team 1 wins. The answer is accepted if $\\frac{|a-b|}{\\max(1,|b|)} \\le 10^{-6}$, where $a$ is your output and $b$ is the jury answer."
            if language == "english"
            else "输出队伍 1 夺冠的最大概率。设你的输出为 $a$、标准答案为 $b$；当 $\\frac{|a-b|}{\\max(1,|b|)} \\le 10^{-6}$ 时，答案视为正确。"
        ])


def parse_document(slot: str, language: str, path: Path, title: str) -> tuple[list[dict], list[dict], str, str, str]:
    layout = pdftotext_layout(path)
    lines = strip_page_noise(layout.splitlines())
    body: list[str] = []
    time_limit = ""
    memory_limit = ""
    title_removed = False
    for line in lines:
        compact = re.sub(r"\s+", " ", line.strip())
        if language == "chinese" and re.match(rf"^Problem\s+{slot}\.\s*", compact):
            title_removed = True
            continue
        if not title_removed and compact == title:
            title_removed = True
            continue
        metadata = re.match(r"^(Input file|Output file|Time limit|Memory limit):\s*(.*)$", compact, re.I)
        if metadata:
            key, value = metadata.groups()
            if key.lower().startswith("time"):
                time_limit = value
            elif key.lower().startswith("memory"):
                memory_limit = value
            continue
        body.append(line)
    samples, body = extract_samples(body)
    sections = split_sections(body, language)
    proofread(slot, language, sections)
    return sections, samples, time_limit, memory_limit, layout


def extract_images(slot: str, path: Path) -> list[dict]:
    captions = IMAGE_CAPTIONS.get(slot, [])
    source_images = [image for page in PdfReader(path).pages for image in page.images]
    images: list[dict] = []
    for index, image in enumerate(source_images):
        suffix = Path(image.name).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
            suffix = ".png"
        filename = f"{slot}-{index + 1}{suffix}"
        (ASSETS / filename).write_bytes(image.data)
        caption_en, caption_zh, image_text_zh = captions[index] if index < len(captions) else (
            f"Problem {slot} figure {index + 1}",
            f"题目 {slot} 配图 {index + 1}",
            None,
        )
        images.append({
            "src": f"/archive-statements/{CONTEST_ID}/assets/{filename}",
            "captionEn": caption_en,
            "captionZh": caption_zh,
            "imageTextZh": image_text_zh,
        })
    return images


def configure(contest_id: str) -> None:
    global SOURCE, OUTPUT, ASSETS, CONTEST_ID, CONTEST_NAME, QOJ_CONTEST_ID
    global PROBLEMS, IMAGE_CAPTIONS, SAMPLE_OVERRIDES, PAGE_HEADER_PREFIX, CONTEST_DATE_TEXT
    if contest_id == "2025-shenyang":
        return
    if contest_id != "2024-shenyang":
        raise ValueError(f"unsupported contest: {contest_id}")
    CONTEST_ID = contest_id
    CONTEST_NAME = "ICPC 区域赛沈阳站"
    QOJ_CONTEST_ID = 1865
    PROBLEMS = CONTEST_2024_PROBLEMS
    SOURCE = ROOT / "outputs" / "archive-pdf" / "original" / contest_id
    OUTPUT = ROOT / "public" / "archive-statements" / contest_id
    ASSETS = OUTPUT / "assets"
    IMAGE_CAPTIONS = IMAGE_CAPTIONS_2024
    SAMPLE_OVERRIDES = {}
    PAGE_HEADER_PREFIX = "2024 ICPC 国际大学生程序设计竞赛亚洲区域赛（沈阳站）"
    CONTEST_DATE_TEXT = "2024/11/24"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contest", choices=("2024-shenyang", "2025-shenyang"), default="2025-shenyang")
    configure(parser.parse_args().contest)
    SOURCE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    for old in ASSETS.iterdir():
        if old.is_file():
            old.unlink()

    manifest: list[dict] = []
    for slot, (problem_id, title_en, title_zh) in PROBLEMS.items():
        english_pdf = SOURCE / f"{slot}-en.pdf"
        chinese_pdf = SOURCE / f"{slot}-zh.pdf"
        ensure_pdf(english_pdf, pdf_url(problem_id))
        ensure_pdf(chinese_pdf, pdf_url(problem_id, chinese=True))
        english, samples, time_limit, memory_limit, _ = parse_document(slot, "english", english_pdf, title_en)
        chinese, _, _, _, chinese_layout = parse_document(slot, "chinese", chinese_pdf, title_zh)
        samples = SAMPLE_OVERRIDES.get(slot, samples)
        pages = chinese_page_range(chinese_layout)
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
                "englishPdfUrl": pdf_url(problem_id),
                "chinesePdfUrl": pdf_url(problem_id, chinese=True),
                "chinesePages": list(pages) if pages else None,
                "sourceUrl": f"https://contest.ucup.ac/contest/{QOJ_CONTEST_ID}/problem/{problem_id}?v=1",
                "sourceLabel": "Universal Cup / QOJ",
            },
            "english": {"sections": english},
            "chinese": {"sections": chinese},
            "sample": samples[0] if samples else None,
            "samples": samples,
            "images": extract_images(slot, english_pdf),
            "status": "ready",
            "message": None,
            "translationCurrent": True,
        }
        (OUTPUT / f"{slot}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest.append({
            "slot": slot,
            "problemId": problem_id,
            "titleEn": title_en,
            "titleZh": title_zh,
            "path": f"/archive-statements/{CONTEST_ID}/{slot}.json",
        })

    (OUTPUT / "manifest.json").write_text(
        json.dumps({"contestId": CONTEST_ID, "officialChinese": True, "problems": manifest}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {len(manifest)} official bilingual statements and {len(list(ASSETS.iterdir()))} images to {OUTPUT}")


if __name__ == "__main__":
    main()
