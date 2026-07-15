"""Import the 2024 ICPC Xi'an Invitational mirror as static bilingual statements.

Luogu exposes the original contest data and bilingual structured Markdown in
the ``lentille-context`` JSON embedded in each problem page.  This importer
keeps the fetched HTML out of the repository and writes only the reviewable
derived JSON plus locally served statement images.
"""

from __future__ import annotations

import json
import re
import time
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
CONTEST_ID = "2024-xian-invitational"
CONTEST_NAME = "ICPC 西安全国邀请赛"
LUOGU_CONTEST_ID = 173404
OUTPUT = ROOT / "public" / "archive-statements" / CONTEST_ID
ASSETS = OUTPUT / "assets"

PROBLEMS = {
    "A": ("P10553", "Guess The Tree", "猜树"),
    "B": ("P10554", "Turn Off The Lights", "关灯"),
    "C": ("P10555", "Fix the Tree", "修复树"),
    "D": ("P10556", "Make Them Straight", "让它们成直线"),
    "E": ("P10557", "Dumb Robot", "笨机器人"),
    "F": ("P10558", "XOR Game", "异或游戏"),
    "G": ("P10559", "The Last Cumulonimbus Cloud", "最后的积雨云"),
    "H": ("P10560", "Holes and Balls", "洞与球"),
    "I": ("P10561", "Smart Quality Inspector", "聪明的质检员"),
    "J": ("P10562", "Triangle", "三角形"),
    "K": ("P10563", "Yet Another Maximum Matching Counting Problem", "又一道最大匹配计数问题"),
    "L": ("P10564", "Rubbish Sorting", "垃圾分类"),
    "M": ("P10565", "Chained Lights", "连锁灯"),
}

SECTION_FIELDS = [
    ("background", "Background", "题目背景"),
    ("description", "Statement", "题目描述"),
    ("formatI", "Input", "输入格式"),
    ("formatO", "Output", "输出格式"),
    ("hint", "Note", "说明"),
]

IMAGE_RE = re.compile(r"!\[([^\]]*)\]\((https?://[^)\s]+)(?:\s+['\"][^'\"]*['\"])?\)")
LIST_RE = re.compile(r"^\s*(?:[-+*]|\d+\.)\s+(.*)$")
ATTRIBUTION_RE = re.compile(r"\s*[（(]由\s*ChatGPT\s*4o\s*翻译[）)]\s*", re.I)


def fetch_problem(session: requests.Session, pid: str) -> tuple[dict, str]:
    url = f"https://www.luogu.com.cn/problem/{pid}"
    for attempt in range(4):
        response = session.get(url, timeout=30, allow_redirects=True)
        soup = BeautifulSoup(response.text, "html.parser")
        context = soup.select_one("#lentille-context")
        if response.ok and context and context.string:
            payload = json.loads(context.string)
            problem = payload.get("data", {}).get("problem")
            if isinstance(problem, dict) and problem.get("pid") == pid:
                return problem, url
        if attempt < 3:
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"failed to fetch structured statement for {pid}: HTTP {response.status_code}")


def normalize_markdown(value: str, *, chinese: bool) -> str:
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"^\s*#\s*statement updated:\s*", "", value, flags=re.I | re.M)
    if chinese:
        value = ATTRIBUTION_RE.sub("", value)
        value = re.sub(r"(?<=[。！？；：]) {2,}(?=\S)", "\n\n", value)
    value = re.sub(r"\$(?!\$)([\s\S]*?)\$", lambda match: "$" + re.sub(r"\s*\n\s*", " ", match.group(1)) + "$", value)
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def polish_chinese(pid: str, content: dict) -> dict:
    polished = dict(content)
    if pid == "P10553":
        polished["hint"] = str(polished.get("hint", "")).replace("两个儿子", "两个子节点")
    elif pid == "P10554":
        polished["formatO"] = (str(polished.get("formatO", ""))
            .replace("如果 Kitty 无法实现她的目标，输出 $-1$ 在一行中。", "如果 Kitty 无法实现目标，在一行中输出 $-1$。")
            .replace("坐标为 $(z,y)1\\leq z\\leq n$", "坐标为 $(z,y)$（$1\\leq z\\leq n$）")
            .replace("坐标为 $(x,z)1\\leq z\\leq n$", "坐标为 $(x,z)$（$1\\leq z\\leq n$）"))
    elif pid == "P10558":
        polished["background"] = "$z$ 表示多重集中值为 $0$ 的数的个数。"
    elif pid == "P10560":
        polished["description"] = str(polished.get("description", "")).replace("$\\{a_n\\}$ 的最小字典序", "序列 $a_1,a_2,\\dots,a_n$ 的最小字典序")
        polished["formatO"] = str(polished.get("formatO", "")).replace("$\\{a_n\\}$ 的最小字典序", "序列 $a_1,a_2,\\dots,a_n$ 的最小字典序")
    elif pid == "P10563":
        polished["description"] = (str(polished.get("description", ""))
            .replace("最大匹配数之和", "最大匹配大小之和")
            .replace("图中的最大匹配数定义为", "图中最大匹配的大小定义为"))
    elif pid == "P10564":
        polished["description"] = str(polished.get("description", "")).replace(
            "对于一个字符串 $s$，其类型是与 $s$ 相似度最大的字符串的类型，在所有之前操作 $1$ 中出现过的字符串中。",
            "对于字符串 $s$，在此前所有操作 $1$ 中出现过的字符串里，找出与 $s$ 相似度最大的字符串；其类型即为 $s$ 的类型。",
        )
    elif pid == "P10565":
        polished["description"] = str(polished.get("description", "")).replace("$i|j, i < j \\le n$", "$i\\mid j$ 且 $i<j\\le n$")
    return polished


def markdown_blocks(value: str) -> list[dict]:
    blocks: list[dict] = []
    lines = value.splitlines()
    index = 0
    paragraph: list[str] = []

    def flush_paragraph() -> None:
        text = "\n".join(paragraph).strip()
        if text:
            blocks.append({"kind": "paragraph", "text": text})
        paragraph.clear()

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            flush_paragraph()
            index += 1
            continue
        if stripped.startswith("```"):
            flush_paragraph()
            language = stripped[3:].strip()
            code: list[str] = []
            index += 1
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            index += 1
            blocks.append({"kind": "code", "code": "\n".join(code).strip("\n"), "language": language})
            continue
        match = LIST_RE.match(line)
        if match:
            flush_paragraph()
            items: list[str] = []
            while index < len(lines):
                item = LIST_RE.match(lines[index])
                if not item:
                    break
                items.append(item.group(1).strip())
                index += 1
            blocks.append({"kind": "bullets", "items": items})
            continue
        if stripped.startswith(">"):
            flush_paragraph()
            quotes: list[str] = []
            while index < len(lines) and lines[index].strip().startswith(">"):
                quotes.append(lines[index].strip()[1:].strip())
                index += 1
            blocks.append({"kind": "code", "code": "\n".join(quotes)})
            continue
        paragraph.append(line.strip())
        index += 1
    flush_paragraph()
    return blocks


def download_images(session: requests.Session, slot: str, contents: list[dict]) -> tuple[list[dict], dict[str, str]]:
    discovered: dict[str, dict] = {}
    replacements: dict[str, str] = {}
    for language, content in (("english", contents[0]), ("chinese", contents[1])):
        for value in content.values():
            if not isinstance(value, str):
                continue
            for alt, url in IMAGE_RE.findall(value):
                entry = discovered.setdefault(url, {"altEn": "", "altZh": ""})
                entry["altZh" if language == "chinese" else "altEn"] = alt.strip()

    images: list[dict] = []
    for image_index, (url, captions) in enumerate(discovered.items(), start=1):
        suffix = Path(urlparse(url).path).suffix.lower()
        if suffix not in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
            suffix = ".png"
        filename = f"{slot}-{image_index}{suffix}"
        response = session.get(url, timeout=30)
        response.raise_for_status()
        (ASSETS / filename).write_bytes(response.content)
        local_url = f"/archive-statements/{CONTEST_ID}/assets/{filename}"
        replacements[url] = local_url
        images.append({
            "src": local_url,
            "captionEn": captions["altEn"] or f"Problem {slot} figure {image_index}",
            "captionZh": captions["altZh"] or ("三角形中被计入的单位正方形" if slot == "J" else f"题目 {slot} 配图 {image_index}"),
            "imageTextZh": None,
        })
    return images, replacements


def sections(content: dict, *, chinese: bool) -> list[dict]:
    result: list[dict] = []
    for key, title_en, title_zh in SECTION_FIELDS:
        value = content.get(key)
        if not isinstance(value, str):
            continue
        value = IMAGE_RE.sub("", normalize_markdown(value, chinese=chinese)).strip()
        if not value:
            continue
        result.append({
            "key": {"background": "background", "description": "statement", "formatI": "input", "formatO": "output", "hint": "note"}[key],
            "title": title_zh if chinese else title_en,
            "blocks": markdown_blocks(value),
        })
    return result


def limit_text(problem: dict) -> tuple[str, str]:
    limits = problem.get("limits") if isinstance(problem.get("limits"), dict) else {}
    times = [int(value) for value in limits.get("time", []) if isinstance(value, (int, float)) and value > 0]
    memories = [int(value) for value in limits.get("memory", []) if isinstance(value, (int, float)) and value > 0]
    time_ms = max(times, default=0)
    memory_kib = max(memories, default=0)
    seconds = time_ms / 1000
    time_label = f"{seconds:g} {'second' if seconds == 1 else 'seconds'}" if time_ms else ""
    memory_label = f"{memory_kib / 1024:g} megabytes" if memory_kib else ""
    return time_label, memory_label


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    for old in ASSETS.iterdir():
        if old.is_file():
            old.unlink()

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (compatible; icpc-trainer statement importer)",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })
    manifest: list[dict] = []
    for slot, (pid, title_en, title_zh) in PROBLEMS.items():
        problem, source_url = fetch_problem(session, pid)
        english = problem.get("content") if isinstance(problem.get("content"), dict) else {}
        chinese = polish_chinese(pid, problem.get("contenu")) if isinstance(problem.get("contenu"), dict) else {}
        if not english or not chinese:
            raise RuntimeError(f"{pid} does not contain both English and Chinese statements")
        images, _ = download_images(session, slot, [english, chinese])
        time_limit, memory_limit = limit_text(problem)
        raw_samples = problem.get("samples") if isinstance(problem.get("samples"), list) else []
        samples = [
            {"input": str(sample[0]).strip("\n"), "output": str(sample[1]).strip("\n"), "mode": "columns"}
            for sample in raw_samples
            if isinstance(sample, list) and len(sample) >= 2
        ]
        payload = {
            "schemaVersion": 1,
            "contestId": CONTEST_ID,
            "contestName": CONTEST_NAME,
            "slot": slot,
            "problemId": int(pid[1:]),
            "titleEn": title_en,
            "titleZh": title_zh,
            "timeLimitText": time_limit,
            "memoryLimitText": memory_limit,
            "source": {
                "kind": "mirror-structured",
                "englishPdfUrl": None,
                "chinesePdfUrl": None,
                "chinesePages": None,
                "sourceUrl": source_url,
                "sourceLabel": "ICPC 2024 西安邀请赛原题原数据镜像",
            },
            "english": {"sections": sections(english, chinese=False)},
            "chinese": {"sections": sections(chinese, chinese=True)},
            "sample": samples[0] if samples else None,
            "samples": samples,
            "images": images,
        }
        (OUTPUT / f"{slot}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        manifest.append({
            "slot": slot,
            "problemId": pid,
            "titleEn": title_en,
            "titleZh": title_zh,
            "path": f"/archive-statements/{CONTEST_ID}/{slot}.json",
            "sourceUrl": source_url,
        })
        print(f"imported {slot} {pid} {title_en}")

    (OUTPUT / "manifest.json").write_text(json.dumps({
        "contestId": CONTEST_ID,
        "luoguContestId": LUOGU_CONTEST_ID,
        "sourceContestUrl": f"https://www.luogu.com.cn/contest/{LUOGU_CONTEST_ID}",
        "problems": manifest,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(manifest)} statements and {len(list(ASSETS.iterdir()))} images to {OUTPUT}")


if __name__ == "__main__":
    main()
