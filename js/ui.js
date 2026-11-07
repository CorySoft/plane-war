/* UI compatibility facade: keep established imports stable while rendering is split by responsibility. */
export {
  spawnDamageNumber, updateDamageNumbers, drawDamageNumbers, clearDamageNumbers,
  initStars, updateStars, drawStars,
} from "./ui/effects.js";
export { hitTestButton } from "./ui/common.js";
export {
  setMenuPage, getMenuPage, getPageVeilAlpha, drawMenu,
  getStartButton, getDifficultyRects, getCodexButton, getCodexBackButton,
  getPowerupCodexButton, getPowerupCodexBackButton, getAchieveButton,
  getAchieveBackButton, getQuestClaimButtons, getShopButton, getShopBackButton,
  getShopBuyButtons, getClearCacheButton, getAchieveCardRects, getHangarButton,
  getHangarBackButton, getTalentButton, getTalentBackButton, getSettingsButton,
  getFeedbackButton, getSettingsBackButton, getHangarCards, getTalentCards,
  getSettingToggles,
} from "./ui/menus.js";
export {
  getCodexScroll, getCodexMaxScroll, getCodexViewport, setCodexScroll,
  getCodexCardRects, getPowerupCardRects, powerupDescFull,
} from "./ui/codex.js";
export {
  getPauseButton, getRestartButton, getGameOverMenuButton,
  getPauseResumeButton, getPauseQuitButton, getSkillCards,
  getReviveYesButton, getReviveNoButton, drawGameOver, drawLevelUp,
  drawPauseButton, drawPause, drawToast, drawRevive,
} from "./ui/overlays.js";
export {
  setDetailCard, getDetailCard, setShowClearCache, getShowClearCache,
  getClearYesButton, getClearNoButton, setHangarConfirm, getHangarConfirm,
  getHangarConfirmYesButton, getHangarConfirmNoButton, setTalentConfirm,
  getTalentConfirm, getTalentConfirmYesButton, getTalentConfirmNoButton,
  drawDetailCard, drawClearCacheConfirm, drawHangarConfirm, drawTalentConfirm,
} from "./ui/dialogs.js";
