/* ===========================================================
 * feedback.js — 主菜单反馈面板：收集用户反馈并提交到服务器日志
 * 面板 DOM 在 index.html，本模块负责开关与提交
 * =========================================================== */

import { APP_VERSION } from "./version.js";

let mask, input, status;
let openAt = 0;        // 打开时间戳：防止打开瞬间的同一个 click 立即关闭
let submitLabel = "提交"; // 提交按钮原始文案（initFeedback 时从 DOM 捕获，成功态后复位用）
let submitting = false;   // 进行中互斥：disabled 只挡鼠标点击，挡不住 Ctrl+Enter 并发

function $(id) { return document.getElementById(id); }

export function initFeedback() {
  mask = $("fbMask");
  input = $("fbInput");
  status = $("fbStatus");
  if (!mask || !input || !status) return;
  // 逐个判空：index.html 若为旧版（缺少按钮）不会在启动期抛错拖垮整个模块
  const cancel = $("fbCancel");
  const submit = $("fbSubmit");
  if (!cancel || !submit) return;
  submitLabel = submit.textContent || submitLabel;
  cancel.addEventListener("click", hideFeedback);
  submit.addEventListener("click", submitFeedback);
  mask.addEventListener("click", e => {
    if (e.target !== mask) return;
    // 刚打开的 250ms 内的点击（来自触发它的同一次 pointerdown→click 冒泡）不关闭
    if (performance.now() - openAt < 250) return;
    hideFeedback();
  });
  input.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitFeedback();
  });
  window.__feedbackLoaded = true;
}

export function showFeedback() {
  if (!mask) return;
  openAt = performance.now();
  const v = APP_VERSION && APP_VERSION !== "0.0.0" ? "v" + APP_VERSION : "";
  setStatus("", "");
  input.value = "";
  // 复位上一次的“提交成功”文案
  const sb = $("fbSubmit");
  if (sb) sb.textContent = submitLabel;
  mask.classList.add("show");
  setTimeout(() => input.focus(), 50);
}

export function hideFeedback() {
  if (mask) mask.classList.remove("show");
}

export function isFeedbackOpen() {
  return !!(mask && mask.classList.contains("show"));
}

function setStatus(text, cls) {
  status.textContent = text;
  status.className = "fb-status " + (cls || "");
}

async function submitFeedback() {
  if (submitting) return;   // 互斥：Ctrl+Enter 可绕过 disabled 连按并发提交
  const text = input.value.trim();
  if (!text) {
    setStatus("请先填写反馈内容", "err");
    input.focus();
    return;
  }
  const submitBtn = $("fbSubmit");
  if (!submitBtn) return;
  const oldLabel = submitBtn.textContent;
  submitting = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "提交中…";
  setStatus("", "");
  try {
    const res = await fetch("feedback.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, ver: APP_VERSION }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) {
      // 服务端会把反馈同时推到微信方糖；推送失败也要如实提示，但反馈已留档
      setStatus(data.pushed ? "已记录并推送到微信，感谢！" : "已记录（微信推送未成功）", data.pushed ? "ok" : "err");
      input.value = "";
      // “提交成功”保留显示：finally 不再回滚文案，下次 showFeedback 复位
      submitBtn.textContent = "提交成功";
      setTimeout(hideFeedback, 900);
    } else {
      setStatus("提交失败，请稍后重试", "err");
      submitBtn.textContent = oldLabel;
    }
  } catch (err) {
    console.error("[feedback]", err);
    setStatus("网络异常，发送失败", "err");
    submitBtn.textContent = oldLabel;
  } finally {
    submitting = false;
    submitBtn.disabled = false;
  }
}