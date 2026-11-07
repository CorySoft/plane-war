import { W, H } from "../config.js";
import { roundRect, setf } from "../utils.js";
import { lineBtn, hexToRgba, C } from "../theme.js";

const uiTime = () => (typeof performance !== "undefined" ? performance.now() : 0) / 1000;
export { uiTime };

function sectionLabel(ctx, text, x, y, color = "rgba(255,255,255,.75)", size = 15) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setf(ctx, "bold " + size + "px 'sans-serif'");
  ctx.fillStyle = color;
  const spaced = text.split("").join(" ");
  ctx.fillText(spaced, x, y);
  ctx.restore();
}

export function pageTitle(ctx, text, x, y, color, size = 32, font = "'sans-serif'") {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  setf(ctx, "bold " + size + "px " + font);
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

export function titleRule(ctx, x, y, halfW, color) {
  ctx.save();
  ctx.fillStyle = hexToRgba(color, 0.8);
  ctx.fillRect(x - halfW, y, halfW * 2, 2);
  ctx.restore();
}

export function hitTestButton(mx, my, rect) {
  return rect && mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
}

export function drawBackButton(ctx, label = "← 返回主菜单") {
  const bw = 180, bx = W / 2 - bw / 2, by = H * 0.92, bh = 40;
  lineBtn(ctx, bx, by, bw, bh, C.cyan, label, { size: 16, weight: "bold", glow: 9, r: 12 });
  return { x: bx, y: by, w: bw, h: bh };
}
