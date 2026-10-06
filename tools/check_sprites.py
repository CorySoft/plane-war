#!/usr/bin/env python3
"""贴图几何门禁：居中 / 对称 / 战机长宽比。

后处理一旦回退到「按边界裁留白」的写法，贴图就会整体偏移，
游戏里表现为机体与子弹中轴对不上。这个脚本在部署前把这些量卡死。

用法：
  python3 tools/check_sprites.py               # 检查默认风格
  python3 tools/check_sprites.py --style toon
退出码：0 = 全部达标；1 = 有指标越界（打印每条违规）。
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
CENTER_TOL = 3.0        # 内容中心 vs 画布中心 容差（px）
# 我方战机：内容宽/高。正上方视角下机身长于翼展 → 该值应 < 1
PLAYER_ASPECT_MIN, PLAYER_ASPECT_MAX = 0.45, 1.05
# 镜像重合度（左半 vs 右半 alpha IoU）：低于此值说明左右明显不对称
IOU_MIN = 0.60


def metrics(path: Path) -> dict:
    im = Image.open(path).convert("RGBA")
    al = np.asarray(im)[..., 3]
    h, w = al.shape
    # 基准必须与 gen_skin.normalize_sprite 完全一致：alpha>60 + 3x3 开运算去杂点
    core = Image.fromarray(((al > 60) * 255).astype(np.uint8), "L")
    core = core.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))
    core = np.asarray(core) > 0
    cols = np.nonzero(core.sum(0) > 0)[0]
    rows = np.nonzero(core.sum(1) > 0)[0]
    if len(cols) == 0 or len(rows) == 0:
        return {"empty": True, "w": w, "h": h}
    x0, x1 = int(cols.min()), int(cols.max())
    y0, y1 = int(rows.min()), int(rows.max())
    sub = core[y0:y1 + 1, x0:x1 + 1]
    mir = sub[:, ::-1]
    iou = float((sub & mir).sum()) / max(float((sub | mir).sum()), 1.0)
    return {
        "w": w, "h": h,
        "cw": x1 - x0 + 1, "ch": y1 - y0 + 1,
        "cxDelta": (x0 + x1) / 2 - w / 2,
        "cyDelta": (y0 + y1) / 2 - h / 2,
        "aspect": (x1 - x0 + 1) / (y1 - y0 + 1),
        "iou": iou,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="贴图几何门禁")
    ap.add_argument("--style", default="neon")
    ap.add_argument("--dir", help="直接指定目录（覆盖 --style）")
    args = ap.parse_args()
    target = Path(args.dir) if args.dir else ROOT / "assets" / "skin" / args.style
    if not target.is_dir():
        print(f"目录不存在: {target}", file=sys.stderr)
        return 1

    files = sorted(p for p in target.iterdir() if p.suffix.lower() == ".png")
    if not files:
        print(f"没有 png: {target}", file=sys.stderr)
        return 1

    bad: list[str] = []
    print(f"{'file':28s} {'canvas':>9s} {'content':>9s} {'dx':>6s} {'dy':>6s} "
          f"{'aspect':>6s} {'iou':>5s}")
    for p in files:
        m = metrics(p)
        if m.get("empty"):
            bad.append(f"{p.name}: 全透明")
            print(f"{p.name:28s} EMPTY")
            continue
        flag = []
        if abs(m["cxDelta"]) > CENTER_TOL or abs(m["cyDelta"]) > CENTER_TOL:
            flag.append("偏心")
        if p.name.startswith("player_") and not (
                PLAYER_ASPECT_MIN <= m["aspect"] <= PLAYER_ASPECT_MAX):
            flag.append("长宽比")
        if m["iou"] < IOU_MIN and p.name.startswith("player_"):
            flag.append("不对称")
        print(f"{p.name:28s} {m['w']}x{m['h']:<5d} {m['cw']}x{m['ch']:<5d} "
              f"{m['cxDelta']:+6.1f} {m['cyDelta']:+6.1f} {m['aspect']:6.2f} "
              f"{m['iou']:5.2f} {'  ← ' + ','.join(flag) if flag else ''}")
        if flag:
            bad.append(f"{p.name}: {','.join(flag)}")

    if bad:
        print(f"\n✗ {len(bad)} 项不达标:")
        for b in bad:
            print(f"   {b}")
        return 1
    print(f"\n✓ {len(files)} 张全部达标")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
