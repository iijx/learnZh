#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/gen-unified-audio.py —— 基于 Edge Neural TTS 的高拟真统一音色语音批量生成工具

用法：
  python3 tools/gen-unified-audio.py                  # 默认生成前 5 个生字的全部语音（测试用）
  python3 tools/gen-unified-audio.py --count 10       # 生成前 10 个生字
  python3 tools/gen-unified-audio.py --all            # 生成全部 20 个完整示范字
  python3 tools/gen-unified-audio.py --voice zh-CN-XiaoxiaoNeural --rate -10%

音色推荐（适老化温和清晰）：
  - zh-CN-XiaoxiaoNeural (女声，温和亲切，语调自然，推荐作为老年识字主音色)
  - zh-CN-YunyangNeural  (男声，专业沉稳，清晰浑厚)
  - zh-CN-XiaoyiNeural   (女声，活泼亲切)
"""

import os
import sys
import json
import re
import asyncio
import argparse
import edge_tts

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT_DIR, "assets", "audio")
CHARS_FILE = os.path.join(ROOT_DIR, "data", "chars.js")
MANIFEST_FILE = os.path.join(ROOT_DIR, "data", "audio-manifest.js")

def extract_chars_data():
    import subprocess
    cmd = ["node", "-e", "console.log(JSON.stringify(require('./data/chars.js')) )"]
    res = subprocess.run(cmd, cwd=ROOT_DIR, capture_output=True, text=True, check=True)
    chars = json.loads(res.stdout)
    return [c for c in chars if c.get("explain") and c["explain"] != "内容待补充"]


def build_jobs_for_chars(char_list):
    jobs = []
    for c in char_list:
        ch = c["char"]
        # 1. 单字读音（读一遍）
        jobs.append({
            "key": ch,
            "filename": f"{ch}.mp3",
            "text": ch,
            "desc": f"单字读音「{ch}」"
        })
        # 2. 组词
        for i, w in enumerate(c.get("words", [])):
            jobs.append({
                "key": f"word_{ch}_{i}",
                "filename": f"word_{ch}_{i}.mp3",
                "text": w,
                "desc": f"组词「{ch} - {w}」"
            })
        # 3. 例句
        if c.get("sentence"):
            jobs.append({
                "key": f"sentence_{ch}",
                "filename": f"sentence_{ch}.mp3",
                "text": c["sentence"],
                "desc": f"例句「{ch} - {c['sentence']}」"
            })
    return jobs

async def synth_job(sem, job, voice, rate, max_retries=3):
    async with sem:
        out_path = os.path.join(AUDIO_DIR, job["filename"])
        for attempt in range(1, max_retries + 1):
            try:
                print(f"🎙️  正在生成: {job['desc']} -> {job['filename']} (第{attempt}次)")
                communicate = edge_tts.Communicate(job["text"], voice, rate=rate)
                await communicate.save(out_path)
                if os.path.exists(out_path) and os.path.getsize(out_path) > 300:
                    size_kb = os.path.getsize(out_path) / 1024
                    print(f"  ✓ 成功: {job['filename']} ({size_kb:.1f} KB)")
                    return True, job["key"]
                else:
                    raise ValueError(f"生成的音频文件过小或为空")
            except Exception as e:
                print(f"  ⚠️ 尝试 {attempt}/{max_retries} 失败 ({job['filename']}): {e}")
                if attempt < max_retries:
                    await asyncio.sleep(1.2 * attempt)
                else:
                    print(f"  ✗ 最终失败: {job['filename']}")
                    return False, job["key"]


def update_manifest():
    files = [f for f in os.listdir(AUDIO_DIR) if f.endswith(".mp3") and f != "silence.mp3"]
    keys = sorted([os.path.splitext(f)[0] for f in files])
    keys_json = json.dumps(keys, ensure_ascii=False, indent=2)

    manifest_code = (
        "// data/audio-manifest.js —— 已生成的本地语音清单（tools/gen-unified-audio.py 自动更新）\n"
        "// key 规则：单字读音 <字>；组词 word_<字>_<i>；例句 sentence_<字>（讲解不合成音频）\n"
        f"var KEYS = {keys_json};\n\n"
        "module.exports = {\n"
        "  has: function (key) { return KEYS.indexOf(key) !== -1; },\n"
        "  path: function (key) {\n"
        "    return this.has(key) ? '/assets/audio/' + key + '.mp3' : null;\n"
        "  },\n"
        "  keys: KEYS\n"
        "};\n"
    )

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        f.write(manifest_code)

    print(f"\n📋 已更新音频清单 {MANIFEST_FILE}（当前共有 {len(keys)} 条可用音频）")

async def main():
    parser = argparse.ArgumentParser(description="生成统一音色的 TTS 课程音频")
    parser.add_argument("--count", type=int, default=5, help="生成的字数（默认前 5 个字）")
    parser.add_argument("--all", action="store_true", help="生成全部 20 个示范生字")
    parser.add_argument("--voice", type=str, default="zh-CN-XiaoxiaoNeural", help="TTS 音色名称")
    parser.add_argument("--rate", type=str, default="-10%", help="语速微调（适老化推荐 -10%）")
    parser.add_argument("--concurrency", type=int, default=3, help="并发合成数")
    args = parser.parse_args()

    os.makedirs(AUDIO_DIR, exist_ok=True)

    all_chars = extract_chars_data()
    selected_chars = all_chars if args.all else all_chars[:args.count]

    char_names = [c["char"] for c in selected_chars]
    print(f"==================================================")
    print(f"📚 目标生字 ({len(selected_chars)} 个): {' '.join(char_names)}")
    print(f"🗣️  选用音色: {args.voice}（温和亲切自然女声）")
    print(f"⏳ 语速调节: {args.rate}（慢一档，吐字清晰）")
    print(f"📁 输出目录: {AUDIO_DIR}")
    print(f"==================================================\n")

    jobs = build_jobs_for_chars(selected_chars)
    print(f"共规划 {len(jobs)} 条音频任务，开始生成...\n")

    sem = asyncio.Semaphore(args.concurrency)
    tasks = [synth_job(sem, job, args.voice, args.rate) for job in jobs]
    results = await asyncio.gather(*tasks)

    success_count = sum(1 for ok, _ in results if ok)
    fail_count = len(results) - success_count

    print(f"\n==================================================")
    print(f"✨ 合成完成：成功 {success_count} 条，失败 {fail_count} 条")
    print(f"==================================================")

    update_manifest()

if __name__ == "__main__":
    asyncio.run(main())
