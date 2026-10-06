#!/usr/bin/env python3
"""plane_war 皮肤贴图批量生成 + 洋红背景抠图后处理。

用 Agnes AI 图像模型生成整套贴图（战机 / 敌机 / Boss / 背景），
统一在纯洋红背景上出图，再用距离键控 + 边缘连通洪水填充抠成透明 PNG。

用法：
  python3 tools/gen_skin.py --list                     # 列出全部资产
  python3 tools/gen_skin.py --style neon --only falcon # 单张试跑
  python3 tools/gen_skin.py --style neon               # 全套生成（跳过已有）
  python3 tools/gen_skin.py --style neon --force       # 强制重新生成

输出：assets/skin/<style>/<id>.png（背景为 .jpg）
原始未处理图缓存于 tools/raw/，重跑后处理无需再次调用 API。
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "tools" / "raw"
CLI = Path("/root/.codebuddy/skills/agnes-ai-generation/scripts/agnes_api.py")
KEY_FILE = Path("/mnt/data/work/projects/agnes-video-generator/.agnes_config/config.json")

# ---------- 风格提示词后缀 ----------
STYLES = {
    "neon": (
        "cyber neon style, dark sci-fi spacecraft, glowing cyan and magenta rim light, "
        "holographic panel accents, high saturation, crisp clean 2D game art"
    ),
    "realistic": (
        "semi-realistic sci-fi concept art style, brushed metal hull with panel lines and "
        "subtle weathering, cinematic rim lighting, painted game illustration"
    ),
    "toon": (
        "cute cartoon chibi style, thick bold outlines, flat vibrant colors, glossy "
        "highlights, rounded friendly shapes, 2D mobile game art"
    ),
}

SPRITE_COMMON = (
    "top-down orthographic view, {facing}, single object centered, filling the frame, "
    "isolated on a solid flat pure magenta #FF00FF background, no shadow, no ground, "
    "no text, no watermark, clean silhouette, video game 2D sprite"
)

# 图标类：必须在 ~24px 下仍可辨认 → 粗轮廓、少细节、无文字
ICON_COMMON = (
    "single flat 2D game ability icon, bold simple silhouette, very thick glowing strokes, "
    "minimal detail, high contrast, perfectly symmetrical, centered, filling the frame, "
    "isolated on a solid flat pure magenta #FF00FF background, no shadow, no ground, "
    "no text, no letters, no numbers, no watermark, clean silhouette, video game UI icon"
)

# 图标专用风格尾（不含「科幻飞船」这类与图标无关的描述）
ICON_TAILS = {
    "neon": "cyber neon style, glowing rim light, high saturation, crisp clean 2D game icon",
    "realistic": "semi-realistic painted game icon, soft shading, clean edges",
    "toon": "cute cartoon style, thick bold outlines, flat vibrant colors, 2D mobile game icon",
}

BG_COMMON = (
    "portrait orientation deep space background painting for a vertical scrolling shooter game, "
    "dark navy and deep violet nebula clouds, scattered stars, subtle cosmic dust, "
    "low contrast empty area in the middle so gameplay stays readable, "
    "pure scenery only: empty starfield and nebula, "
    "absolutely no spaceships, no aircraft, no planets, no UFOs, no objects, "
    "no text, no watermark, no user interface"
)

# ---------- 资产清单 ----------
# kind: sprite（洋红底抠透明）/ bg（整图裁切）
# gen: 生成分辨率；out: 后处理目标最长边（sprite）或忽略（bg）
ASSETS: list[dict] = [
    # —— 我方战机（机头朝上）——
    dict(id="player_falcon", kind="sprite", facing="nose pointing up",
         subject="sleek teal-cyan balanced fighter jet with swept wings and a glowing blue cockpit canopy", out=320),
    dict(id="player_blaze", kind="sprite", facing="nose pointing up",
         subject="compact orange-red high fire-rate attack aircraft with triple gun barrels and flame vent nozzles", out=320),
    dict(id="player_ironwall", kind="sprite", facing="nose pointing up",
         subject="bulky olive-grey armored gunship with extra thick plated fuselage and wide heavy wings", out=320),
    dict(id="player_phantom", kind="sprite", facing="nose pointing up",
         subject="sharp violet delta-wing stealth fighter with needle nose and glowing purple engine trail", out=320),
    dict(id="player_thor", kind="sprite", facing="nose pointing up",
         subject="tall vertical top-down fighter jet, fuselage clearly longer than the wingspan, "
                 "nose up, narrow swept wings, twin engines at the tail, yellow-gold hull", out=320),
    dict(id="player_void", kind="sprite", facing="nose pointing up",
         subject="dark purple alien organic spacecraft with crystalline shards and a glowing rift core", out=320),
    # —— 敌机（机头朝下）——
    dict(id="enemy_small", kind="sprite", facing="nose pointing down",
         subject="small red angular scout drone with a single glowing eye, triangular dart shape", out=256),
    dict(id="enemy_mid", kind="sprite", facing="nose pointing down",
         subject="orange hexagonal gunship with two side blasters and an armored cockpit", out=256),
    dict(id="enemy_big", kind="sprite", facing="nose pointing down",
         subject="large lavender heavy cruiser with broad wings and multiple turret barrels", out=320),
    dict(id="enemy_laser", kind="sprite", facing="nose pointing down",
         subject="crimson laser frigate with a long forward cannon barrel and cooling fins", out=256),
    dict(id="enemy_shield", kind="sprite", facing="nose pointing down",
         subject="azure diamond-shaped fighter with a translucent blue energy shield dome", out=256),
    dict(id="enemy_split", kind="sprite", facing="nose pointing down",
         subject="lime-green segmented drone orb with visible seam cracks, mechanical beetle shape", out=256),
    # —— Boss（机头朝下）——
    dict(id="boss_mothership", kind="sprite", facing="nose pointing down",
         subject="huge crimson-pink alien carrier mothership with hangar bays and a command tower, menacing", out=512),
    dict(id="boss_fortress", kind="sprite", facing="nose pointing down",
         subject="massive bronze armored battle fortress with turret towers and thick plating", out=512),
    dict(id="boss_phantom", kind="sprite", facing="nose pointing down",
         subject="giant violet stealth battleship with phased cloak panels and blade-like prows", out=512),
    # —— 道具图标（~24px 下仍需可辨认）——
    dict(id="powerup_power", kind="icon", out=128,
         subject="bright golden upward cannon barrel with a radiant star muzzle flash, luminous glowing yellow #ffd166, high brightness, no dark or black areas, very high contrast"),
    dict(id="powerup_life", kind="icon", out=128,
         subject="plump bright green heart with a bold cross emblem, color #7CFC00"),
    dict(id="powerup_shield", kind="icon", out=128,
         subject="cyan energy shield badge with hexagon plating, color #66e0ff"),
    dict(id="powerup_madHunt", kind="icon", out=128,
         subject="three bold diagonal claw slash marks, glowing orange #fca311, very high contrast"),
    dict(id="powerup_rapid", kind="icon", out=128,
         subject="single bold lightning bolt, color #ffe066"),
    dict(id="powerup_speed", kind="icon", out=128,
         subject="rocket exhaust flame with two horizontal speed streaks, color #9be8ff"),
    dict(id="powerup_freeze", kind="icon", out=128,
         subject="six-armed snowflake crystal, color #8ad4ff"),
    dict(id="powerup_magnet", kind="icon", out=128,
         subject="horseshoe magnet with two attraction arcs, color #d0a6ff"),
    dict(id="powerup_double", kind="icon", out=128,
         subject="two stacked upward chevron arrows, color #ffa8d9"),
    dict(id="powerup_xppack", kind="icon", out=128,
         subject="glowing energy crystal inside a small capsule canister, color #8ad4ff"),
    dict(id="powerup_skillup", kind="icon", out=128,
         subject="four-pointed sparkle star with a surrounding ring, color #fca311"),
    dict(id="powerup_drop", kind="icon", out=128,
         subject="four leaf clover, color #ffd93b"),
    dict(id="powerup_critboost", kind="icon", out=128,
         subject="bright glowing pink crosshair target with an arrow hitting the bullseye, luminous #ff8fa3, very high contrast"),
    dict(id="powerup_knockback", kind="icon", out=128,
         subject="expanding shockwave ring with three outward arrows, color #5ee6ff"),
    dict(id="powerup_randomSkill", kind="icon", out=128,
         subject="six-sided dice cube with round pips, color #d0a6ff"),
    # —— 技能图标（抽奖动画 / 技能图鉴）——
    dict(id="skill_dmg", kind="icon", out=128,
         subject="single bold bullet with a bright star impact burst, glowing cyan #5ee6ff, very high contrast"),
    dict(id="skill_rate", kind="icon", out=128,
         subject="three parallel bullet streaks speeding upward, color #5ee6ff"),
    dict(id="skill_move", kind="icon", out=128,
         subject="curved swoosh arrow with a small wing, color #5ee6ff"),
    dict(id="skill_lifesteal", kind="icon", out=128,
         subject="energy droplet inside a suction spiral, color #ff8fa3"),
    dict(id="skill_explosion", kind="icon", out=128,
         subject="round explosion fireball with spiky blast, color #ff8a55"),
    dict(id="skill_knockback", kind="icon", out=128,
         subject="shockwave ring with an arrow bouncing backward, color #c8a6ff"),
    dict(id="skill_shield", kind="icon", out=128,
         subject="rounded shield emblem with a bright core, color #7CFC00"),
    dict(id="skill_crit", kind="icon", out=128,
         subject="crosshair with a star hit mark, color #ff8fa3"),
    dict(id="skill_split", kind="icon", out=128,
         subject="bullet splitting into three fragments, color #ff8a55"),
    dict(id="skill_penetrate", kind="icon", out=128,
         subject="arrow piercing through three stacked plates, color #5ee6ff"),
    dict(id="skill_volley", kind="icon", out=128,
         subject="three bullets flying in a tight row, color #5ee6ff"),
    dict(id="skill_scatter", kind="icon", out=128,
         subject="fan of five bullets spreading outward, color #5ee6ff"),
    # —— 背景 ——
    dict(id="bg_space", kind="bg", bg=BG_COMMON),
    dict(id="bg_menu", kind="bg",
         bg=BG_COMMON.replace(
             "pure scenery only: empty starfield and nebula",
             "pure scenery only: a very small distant fleet of tiny ship silhouettes "
             "near the top horizon, far away and low contrast")),
]

ASSET_MAP = {a["id"]: a for a in ASSETS}


def api_key() -> str:
    for name in ("AGNES_API_KEY", "AGNES_API_TOKEN", "APIHUB_AGNES_API_KEY"):
        value = os.environ.get(name)
        if value:
            return value
    if KEY_FILE.is_file():
        data = json.loads(KEY_FILE.read_text())
        keys = data.get("api_keys") or []
        if keys and keys[0].get("key"):
            return keys[0]["key"]
    raise SystemExit("缺少 Agnes API key（环境变量或 .agnes_config/config.json）")


def build_prompt(asset: dict, style: str) -> str:
    tail = STYLES[style]
    if asset["kind"] == "bg":
        return f"{asset['bg']}, {tail}"
    if asset["kind"] == "icon":
        # 图标不吃「科幻飞船」那套尾巴，换成图标专用风格尾
        return f"{ICON_COMMON}, {asset['subject']}, {ICON_TAILS[style]}"
    return (SPRITE_COMMON.format(facing=asset["facing"]) + ", " + asset["subject"] + ", " + tail)


def call_api(prompt: str, size: str, key: str, retries: int = 3) -> str:
    """调 Agnes CLI 生成一张图，返回图片 URL。"""
    env = os.environ.copy()
    env["AGNES_API_KEY"] = key
    last = ""
    for attempt in range(1, retries + 1):
        try:
            proc = subprocess.run(
                [sys.executable, str(CLI), "image", "--prompt", prompt,
                 "--size", size, "--no-translate-prompt"],
                capture_output=True, text=True, env=env, timeout=240,
            )
        except subprocess.TimeoutExpired:
            last = "timeout"
            time.sleep(4 * attempt)
            continue
        if proc.returncode == 0:
            try:
                data = json.loads(proc.stdout)
            except json.JSONDecodeError:
                last = f"non-json stdout: {proc.stdout[:200]}"
            else:
                urls = data.get("urls") or []
                if urls:
                    return urls[0]
                last = f"no urls: {json.dumps(data)[:200]}"
        else:
            last = (proc.stderr or proc.stdout)[:300]
        time.sleep(4 * attempt)
    raise RuntimeError(f"生成失败（重试 {retries} 次）: {last}")


def download(url: str, dest: Path, retries: int = 3) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 plane_war-skin"})
    last = ""
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                blob = resp.read()
            if len(blob) < 1024:
                raise RuntimeError(f"下载内容过小 {len(blob)}B")
            dest.write_bytes(blob)
            return
        except Exception as exc:  # noqa: BLE001 — 网络错误统一重试
            last = str(exc)
            time.sleep(3 * attempt)
    raise RuntimeError(f"下载失败: {last}")


def remove_background(im: Image.Image) -> tuple[Image.Image, float]:
    """洋红底抠透明：边缘连通洪水填充判定外背景 + 距离软边 alpha + 反混合去边。

    返回 (RGBA 图, 外背景占比)。占比异常（背景没按要求出图）时由调用方告警。
    """
    rgb = np.asarray(im.convert("RGB")).astype(np.float32)
    h, w, _ = rgb.shape

    # 键控色 = 四边 8px 像素中值（对模型轻微色偏稳健）
    border = np.concatenate([
        rgb[:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3),
        rgb[:, :8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3),
    ])
    key = np.median(border, axis=0)
    dist = np.sqrt(((rgb - key) ** 2).sum(axis=-1))

    # 候选背景含抗锯齿混色带（阈值放宽），再从边缘洪水填充只保留「外背景」，
    # 机身内部的洋红/粉色区域因不与边缘连通而被保护。
    # .copy()：fromarray 的图是只读的，floodfill 会静默失败（PIL 捕获 ValueError）
    cand = Image.fromarray(((dist < 150) * 255).astype(np.uint8), "L").copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1),
                 (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if cand.getpixel(seed) == 255:
            ImageDraw.floodfill(cand, seed, 128, thresh=0)
    outer = np.asarray(cand) == 128
    frac = float(outer.mean())

    # 软边：距离键控色越远越不透明；羽化掉 1 级消除抠图白/洋红边
    alpha = np.clip((dist - 55.0) / 80.0, 0.0, 1.0)
    alpha = np.where(outer, alpha, 1.0)
    alpha = np.clip((alpha - 0.06) / 0.94, 0.0, 1.0)

    # 反混合：半透明像素 = a*前景 + (1-a)*键色，解出前景，去掉洋红镶边
    semi = (alpha > 0.06) & (alpha < 0.94)
    if semi.any():
        a3 = np.clip(alpha, 0.06, None)[..., None]
        fg = np.clip((rgb - (1.0 - a3) * key) / a3, 0, 255)
        rgb = np.where(semi[..., None], fg, rgb)

    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA"), frac


def _bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())


def normalize_sprite(im: Image.Image, max_side: int) -> Image.Image:
    """去孤立杂点 → 裁到内容 → **按可见主体居中**的新画布等距留白 → 等比缩放。

    两个坑都踩过：
    ① 留白必须新建画布贴上去，不能 `max(0, x0-pad)` 裁边界——内容贴边时那一侧
       留白被裁掉，贴图整体偏移（falcon 曾因此右偏 23px，子弹与机体中轴对不上）；
    ② 裁切框用 alpha>12 的「含辉光」范围（不切掉光晕），但**居中基准**用
       alpha>60 的可见主体，否则半透明光晕会把主体顶到一边（phantom 曾偏 4px）。
    """
    alpha = np.asarray(im)[..., 3]

    def opened(mask: np.ndarray) -> np.ndarray:
        """3x3 开运算：腐蚀吃掉孤立杂点，膨胀补回主体。"""
        img = Image.fromarray((mask * 255).astype(np.uint8), "L")
        img = img.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
        return np.asarray(img) > 0

    core = _bbox(opened(alpha > 60)) or _bbox(alpha > 60)
    if core is None:
        raise RuntimeError("抠图后全透明（背景键控失败）")
    # 裁切框取「含光晕」的软边界——同样先开运算，否则残留杂点会把裁切框撑歪，
    # 居中位移超过 2*pad 后被钳制，主体依旧偏心。
    soft = _bbox(opened(alpha > 12)) or core
    x0, x1 = min(soft[0], core[0]), max(soft[1], core[1])
    y0, y1 = min(soft[2], core[2]), max(soft[3], core[3])

    crop = im.crop((x0, y0, x1 + 1, y1 + 1))
    pad = max(2, int(0.04 * max(crop.width, crop.height)))
    # 可见主体在 crop 内的中心 → 反推左右/上下留白，使主体落在画布正中
    core_cx = (core[0] + core[1]) / 2 - x0 + 0.5
    core_cy = (core[2] + core[3]) / 2 - y0 + 0.5
    left = max(0, min(2 * pad, int(round(pad + (crop.width / 2 - core_cx)))))
    top = max(0, min(2 * pad, int(round(pad + (crop.height / 2 - core_cy)))))
    right, bottom = 2 * pad - left, 2 * pad - top
    canvas = Image.new("RGBA", (left + crop.width + right, top + crop.height + bottom),
                       (0, 0, 0, 0))
    canvas.alpha_composite(crop, (left, top))

    if max(canvas.size) > max_side:
        scale = max_side / max(canvas.size)
        canvas = canvas.resize(
            (max(1, round(canvas.width * scale)), max(1, round(canvas.height * scale))),
            Image.LANCZOS)
    return canvas


def process_sprite(raw_path: Path, asset: dict, out_path: Path) -> None:
    im = Image.open(raw_path)
    rgba, frac = remove_background(im)
    if frac < 0.04 or frac > 0.995:
        print(f"  ! {asset['id']}: 外背景占比 {frac:.1%}（背景可能非纯色），请人工检查")
    rgba = normalize_sprite(rgba, asset["out"])
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rgba.save(out_path, optimize=True)


def process_bg(raw_path: Path, out_path: Path) -> None:
    im = Image.open(raw_path).convert("RGB")
    # 模型爱在边缘画霓虹边框/UI 装饰，先向内裁 3.5% 去掉，再做 cover 裁切
    cw, ch = round(im.width * 0.035), round(im.height * 0.035)
    im = im.crop((cw, ch, im.width - cw, im.height - ch))
    tw, th = 720, 1080                       # 2:3，与 480x720 逻辑画布一致
    scale = max(tw / im.width, th / im.height)
    nw, nh = max(tw, round(im.width * scale)), max(th, round(im.height * scale))
    im = im.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - tw) // 2, (nh - th) // 2
    im = im.crop((left, top, left + tw, top + th))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(out_path, quality=82, optimize=True, progressive=True)


def ensure_raw(asset: dict, style: str, key: str, size: str, force: bool) -> Path:
    raw = RAW_DIR / style / f"{asset['id']}.png"
    if raw.is_file() and raw.stat().st_size > 1024 and not force:
        return raw
    raw.parent.mkdir(parents=True, exist_ok=True)
    url = call_api(build_prompt(asset, style), size, key)
    download(url, raw)
    return raw


def generate_one(asset: dict, style: str, key: str, force: bool, out_dir: Path) -> str:
    size = "768x1152" if asset["kind"] == "bg" else "1024x1024"
    out_ext = "jpg" if asset["kind"] == "bg" else "png"
    out_path = out_dir / f"{asset['id']}.{out_ext}"
    if out_path.is_file() and not force:
        return f"= {asset['id']} 已存在，跳过"
    t0 = time.time()
    raw = ensure_raw(asset, style, key, size, force)
    if asset["kind"] == "bg":
        process_bg(raw, out_path)
    else:
        process_sprite(raw, asset, out_path)
    kb = out_path.stat().st_size // 1024
    return f"+ {asset['id']}  {time.time() - t0:.0f}s  {out_path.name} {kb}KB"


def main() -> None:
    ap = argparse.ArgumentParser(description="plane_war 皮肤批量生成")
    ap.add_argument("--style", default="neon", choices=sorted(STYLES))
    ap.add_argument("--only", help="逗号分隔的资产 id，只生成这些")
    ap.add_argument("--force", action="store_true", help="忽略已有输出重新生成")
    ap.add_argument("--workers", type=int, default=3, help="并发生成数（默认 3）")
    ap.add_argument("--list", action="store_true", help="列出资产后退出")
    ap.add_argument("--postprocess-only", action="store_true",
                    help="只跑后处理（用 tools/raw 缓存，不调 API）")
    args = ap.parse_args()

    if args.list:
        for a in ASSETS:
            print(f"{a['id']:20s} {a['kind']:6s} {a.get('subject') or a.get('bg', '')[:60]}")
        return

    todo = ASSETS
    if args.only:
        ids = [s.strip() for s in args.only.split(",") if s.strip()]
        missing = [i for i in ids if i not in ASSET_MAP]
        if missing:
            raise SystemExit(f"未知资产 id: {', '.join(missing)}")
        todo = [ASSET_MAP[i] for i in ids]

    out_dir = ROOT / "assets" / "skin" / args.style
    key = "" if args.postprocess_only else api_key()
    print(f">> 风格 {args.style}，共 {len(todo)} 项 → {out_dir.relative_to(ROOT)}/")

    errors: list[tuple[str, str]] = []

    def work(asset: dict) -> str:
        try:
            if args.postprocess_only:
                size = "768x1152" if asset["kind"] == "bg" else "1024x1024"
                raw = RAW_DIR / args.style / f"{asset['id']}.png"
                if not raw.is_file():
                    return f"- {asset['id']} 无 raw 缓存，跳过"
                out_ext = "jpg" if asset["kind"] == "bg" else "png"
                out_path = out_dir / f"{asset['id']}.{out_ext}"
                if asset["kind"] == "bg":
                    process_bg(raw, out_path)
                else:
                    process_sprite(raw, asset, out_path)
                return f"+ {asset['id']} 仅后处理"
            return generate_one(asset, args.style, key, args.force, out_dir)
        except Exception as exc:  # noqa: BLE001 — 单项失败不拖垮整批
            errors.append((asset["id"], str(exc)))
            return f"! {asset['id']} 失败: {exc}"

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(work, a) for a in todo]
        for fut in as_completed(futures):
            print(fut.result(), flush=True)

    if errors:
        print(f"\n>> {len(errors)} 项失败：")
        for i, msg in errors:
            print(f"   {i}: {msg}")
        raise SystemExit(1)
    print("\n>> 全部完成")


if __name__ == "__main__":
    main()
