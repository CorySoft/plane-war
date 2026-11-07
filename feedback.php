<?php
/* ============================================================
 * feedback.php — 接收游戏内反馈
 *   1) 追加写入 feedback.log（服务端留档）
 *   2) 推送通知到微信（统一网关优先，方糖兜底）
 *
 * 推送策略：
 *   - 优先经 wechat-publisher 的 /notify/sct 统一网关转发（token 只存于那端）
 *   - 网关未配置 / 网络不可达时，退回本文件内直连方糖（SCT_TOKEN 兜底）
 *
 * 安全策略（2026 修订）：
 *   - 方糖 token 外置到 feedback.secret.php（不进仓库、缺失即停推，失败关闭）
 *   - 只接受同源请求（旧版 Access-Control-Allow-Origin: * 等于开放微信推送机）
 *   - 单 IP 滑窗限流（60s / 5 次），超出直接 429，不落盘不推送
 *   - 所有客户端可控字段单行化，杜绝日志注入与推送标题伪造
 *   - 日志与限流计数写到文档根之外，避免被 HTTP 直接取到
 *
 * 方糖 token 只保存在服务端：若写进前端 JS，任何访问者都能拿到并
 * 用它往你的微信刷消息，因此绝不下发到浏览器。
 * ============================================================ */
// 方糖 token 改为外置：只放在同目录下不进仓库的 feedback.secret.php 里。
// 缺失（或被误提交成空）时推送直接停用，接口其余部分照常工作（失败关闭）。
// 这样即便本文件被公开，也拿不到能往你微信推消息的凭据。
$secretFile = __DIR__ . '/feedback.secret.php';
if (is_file($secretFile)) {
    require_once $secretFile;
}
if (!defined('SCT_TOKEN')) {
    define('SCT_TOKEN', '');
}
define('SCT_API', 'https://sctapi.ftqq.com/');
define('PUSH_THROTTLE_SEC', 5);   // 全局最短推送间隔，防止被刷屏

// 统一网关：把反馈经 wechat-publisher 的 /notify/sct 转发（token 只存于那端）。
// 留空 = 不经由网关，直接走本地方糖（下方 SCT_TOKEN 作为兜底）。
// 部署 wechat-publisher 后填写其地址与 X-Shared-Secret 即可启用统一网关。
// 同样建议写进 feedback.secret.php，避免密钥随仓库外流。
if (!defined('WECHAT_PUBLISHER_URL')) {
    define('WECHAT_PUBLISHER_URL', '');
}
if (!defined('WP_SECRET')) {
    define('WP_SECRET', '');
}

// 允许的来源（同源才放行）。留空数组 = 自动按 HTTP_HOST 同源校验。
// 旧版是 Access-Control-Allow-Origin: *，等于把接口当成公开的微信推送机：
// 任何人写个页面就能拿你的 token 往你微信推任意内容。
if (!defined('ALLOWED_ORIGINS')) {
    define('ALLOWED_ORIGINS', []);
}

// 单 IP 频率限制：窗口秒内最多 MAX_REQ 次提交（超出直接 429，不落盘不推送）
define('RATE_WINDOW_SEC', 60);
define('RATE_MAX_REQ', 5);

header('Content-Type: application/json; charset=utf-8');
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('X-Content-Type-Options: nosniff');

// ---------- 来源校验 + CORS（同源才回 Access-Control-Allow-Origin）----------
$origin = isset($_SERVER['HTTP_ORIGIN']) ? (string)$_SERVER['HTTP_ORIGIN'] : '';
$allowed = ALLOWED_ORIGINS;
if (!is_array($allowed) || count($allowed) === 0) {
    $host = isset($_SERVER['HTTP_HOST']) ? (string)$_SERVER['HTTP_HOST'] : '';
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $allowed = $host !== '' ? [$scheme . '://' . $host] : [];
}
// 无 Origin 的请求（同源表单/纯 POST）按放行处理，否则正常浏览器请求会被自己挡掉
$sameOrigin = false;
if ($origin === '') {
    $sameOrigin = true;
} else {
    foreach ($allowed as $o) {
        if (strcasecmp(rtrim((string)$o, '/'), rtrim($origin, '/')) === 0) {
            $sameOrigin = true;
            break;
        }
    }
}
if ($sameOrigin && $origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!$sameOrigin) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'forbidden_origin']);
    exit;
}

// ---------- 单 IP 频率限制 ----------
/**
 * 私有状态目录：日志与限流计数都放这里。
 * htdocs/ 是文档根、wwwroot/ 在其内，所以写在 wwwroot 里的任何文件都能被 HTTP 取到；
 * 优先用账户根（htdocs 的上一级，不在 web 服务范围内），不可写才退回本目录，
 * 届时由 .htaccess 的 403 规则兜底。
 */
$stateDir = __DIR__ . '/../..';
if (!is_dir($stateDir) || !is_writable($stateDir)) {
    $stateDir = __DIR__;
}
$logFile = $stateDir . '/plane_war_feedback.log';

$ip = isset($_SERVER['REMOTE_ADDR']) ? (string)$_SERVER['REMOTE_ADDR'] : 'unknown';
$rateFile = $stateDir . '/.pw_rate_' . md5($ip) . '.txt';
$now0 = time();
$rateList = [];
if (is_file($rateFile)) {
    $rawRate = @file_get_contents($rateFile);
    if (is_string($rawRate) && $rawRate !== '') {
        foreach (explode(',', $rawRate) as $ts) {
            $t = (int)$ts;
            if ($t > 0 && ($now0 - $t) < RATE_WINDOW_SEC) {
                $rateList[] = $t;
            }
        }
    }
}
if (count($rateList) >= RATE_MAX_REQ) {
    http_response_code(429);
    header('Retry-After: ' . RATE_WINDOW_SEC);
    echo json_encode(['ok' => false, 'error' => 'rate_limited']);
    exit;
}
$rateList[] = $now0;
@file_put_contents($rateFile, implode(',', $rateList), LOCK_EX);

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = ['content' => $raw];
}

/**
 * 单行化 + 控制字符清理。
 * 客户端可控字段若直接拼进按行分隔的日志与 Markdown 推送正文，
 * 一条带换行的反馈就能伪造出多条日志记录 / 伪造推送标题（日志注入）。
 */
function fw_one_line($s, $maxChars = 2000)
{
    $s = (string)$s;
    // 去掉所有控制字符（含 CRLF / 各类 Unicode 行分隔符），再把连续空白压成一个空格
    $s = preg_replace('/[\x00-\x1F\x7F\x{2028}\x{2029}]/u', ' ', $s);
    if ($s === null) {
        $s = '';
    }
    $s = preg_replace('/\s+/u', ' ', $s);
    if ($s === null) {
        $s = '';
    }
    $s = trim($s);
    if (function_exists('mb_substr')) {
        return mb_substr($s, 0, $maxChars);
    }
    return substr($s, 0, $maxChars);
}

$content = isset($payload['content']) ? fw_one_line($payload['content'], 2000) : '';
if ($content === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty']);
    exit;
}

$ver = fw_one_line(isset($payload['ver']) ? $payload['ver'] : '-', 32);
$from = fw_one_line(isset($payload['from']) ? $payload['from'] : '', 32);
$line = '[' . date('Y-m-d H:i:s') . '] ' . $ip . ' v' . $ver .
    ($from !== '' ? ' [' . $from . ']' : '') .
    ' ' . $content . "\n";

$ok = @file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX);
if ($ok === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'write_failed']);
    exit;
}

// 限制日志文件大小（超过 512KB 时保留最近一半）
if (@file_exists($logFile) && @filesize($logFile) > 512 * 1024) {
    $lines = @file($logFile);
    if (is_array($lines) && count($lines) > 1) {
        $keep = array_slice($lines, - (int)(count($lines) / 2));
        @file_put_contents($logFile, implode('', $keep), LOCK_EX);
    }
}

// ---------- 推送到微信（统一网关优先，方糖兜底） ----------
$pushed = false;
$pushErr = null;
$title = '【飞机大战】新反馈 v' . $ver;
$desp = "**时间**：" . date('Y-m-d H:i:s') . "（来自 " . $ip . "）\n\n" .
        "**版本**：v" . $ver . "\n\n" .
        "**内容**：\n\n" . $content;

// 全局节流文件也挪到私有目录（原 __DIR__ 在文档根内，可被 .push_throttle 直接取到）
$throttleFile = $stateDir . '/.pw_push_throttle';
$now = time();
$last = @file_exists($throttleFile) ? (int)@file_get_contents($throttleFile) : 0;
$throttled = ($now - $last) < PUSH_THROTTLE_SEC;

if (!$throttled) {
    @file_put_contents($throttleFile, (string)$now);

    $gwNetworkErr = false;
    // 1) 优先走 wechat-publisher 统一网关（token 只存于那端）
    if (WECHAT_PUBLISHER_URL !== '') {
        $gw = wp_gateway_send($title, $desp);
        if (!empty($gw['ok'])) {
            $pushed = true;
        } elseif (!empty($gw['networkErr'])) {
            $gwNetworkErr = true;          // 网关不可达 → 退回到本地方糖
            $pushErr = $gw['err'];
        } else {
            $pushErr = $gw['err'];         // 网关可达但拒绝（如 token/secret 错）→ 不重复推送
        }
    }

    // 2) 兜底：未配置网关，或网关网络不可达时，直接走本地方糖
    if (!$pushed && (WECHAT_PUBLISHER_URL === '' || $gwNetworkErr)) {
        if (SCT_TOKEN !== '') {
            try {
                $resp = sct_send($title, $desp);
                $pushed = is_array($resp) && isset($resp['code']) && (int)$resp['code'] === 0;
                if (!$pushed) {
                    $pushErr = is_array($resp) && isset($resp['message']) ? $resp['message'] : 'unknown';
                }
            } catch (Exception $e) {
                $pushErr = $e->getMessage();
            }
        }
    }
} else {
    $pushErr = 'throttled';
}

// 推送失败不影响「已记录」：日志已经落盘，用户不该看到报错
echo json_encode(['ok' => true, 'pushed' => $pushed, 'pushError' => $pushErr]);

/**
 * 经 wechat-publisher 统一网关推送（/notify/sct）。
 * 返回 ['ok'=>bool, 'networkErr'=>bool, 'err'=>string]
 *   ok         : 网关返回 ok 且方糖 code=0
 *   networkErr : 无法连通网关（curl 错误 / 无响应），此时应退回本地方糖
 *   err        : 网关可达但拒绝时的错误信息
 */
function wp_gateway_send($title, $desp)
{
    $url = rtrim(WECHAT_PUBLISHER_URL, '/') . '/notify/sct';
    $body = json_encode(['title' => $title, 'content' => $desp], JSON_UNESCAPED_UNICODE);
    $headers = ['Content-Type: application/json'];
    if (WP_SECRET !== '') {
        $headers[] = 'X-Shared-Secret: ' . WP_SECRET;
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($raw === false) {
            return ['ok' => false, 'networkErr' => true, 'err' => $err];
        }
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => implode("\r\n", $headers) . "\r\n",
            'content' => $body,
            'timeout' => 10,
            'ignore_errors' => true,
        ]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) {
            return ['ok' => false, 'networkErr' => true, 'err' => 'file_get_contents 失败'];
        }
    }

    $d = json_decode($raw, true);
    if (!is_array($d)) {
        return ['ok' => false, 'networkErr' => false, 'err' => '网关返回非 JSON'];
    }
    // 网关成功且方糖 code=0 才算送达
    $sctCode = isset($d['result']['code']) ? (int)$d['result']['code'] : -1;
    if (!empty($d['ok']) && $sctCode === 0) {
        return ['ok' => true, 'networkErr' => false, 'err' => ''];
    }
    $msg = isset($d['message']) ? $d['message'] : (isset($d['error']) ? $d['error'] : '网关拒绝');
    return ['ok' => false, 'networkErr' => false, 'err' => (string)$msg];
}

/**
 * 调用方糖推送接口。优先 cURL，退回 file_get_contents。
 * @return array|null 解析后的响应；失败返回 null
 */
function sct_send($title, $desp)
{
    $url = SCT_API . SCT_TOKEN . '.send';
    $post = http_build_query(['title' => $title, 'desp' => $desp], '', '&', PHP_QUERY_RFC3986);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $post,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $body = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($body === false) return null;
        return json_decode($body, true);
    }

    $ctx = stream_context_create(['http' => [
        'method' => 'POST',
        'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
        'content' => $post,
        'timeout' => 10,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    if ($body === false) return null;
    return json_decode($body, true);
}