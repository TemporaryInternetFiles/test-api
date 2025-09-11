<?php
/**
 * Skript s možností zapnout/vypnout logování TrackingId a User-Agent.
 */

// ---- Konfigurace ----
$ENABLE_TRACKING_LOG   = false;   // zap/vyp logování do tracking_ids.log
$ENABLE_USER_AGENT_LOG = false;   // zap/vyp logování do user_agents.txt


// ---- Pomocné funkce ----
function getRequestHeaders(): array {
    if (function_exists('getallheaders')) {
        $h = getallheaders();
        if (is_array($h)) return $h;
    }
    $headers = [];
    foreach ($_SERVER as $key => $value) {
        if (strpos($key, 'HTTP_') === 0) {
            $name = str_replace('_', '-', substr($key, 5));
            $headers[$name] = $value;
        } elseif ($key === 'CONTENT_TYPE') {
            $headers['Content-Type'] = $value;
        } elseif ($key === 'CONTENT_LENGTH') {
            $headers['Content-Length'] = $value;
        }
    }
    return $headers;
}

function readHeader(string $name, array $headers): ?string {
    $lower = array_change_key_case($headers, CASE_LOWER);
    $keyLower = strtolower($name);
    if (isset($lower[$keyLower])) {
        $val = $lower[$keyLower];
    } else {
        $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $val = $_SERVER[$serverKey] ?? null;
    }
    if ($val === null || $val === '') {
        return null;
    }
    if (strpos($val, ',') !== false) {
        $val = trim(explode(',', $val)[0]);
    }
    return trim($val);
}

function getClientIp(): string {
    $candidates = ['HTTP_X_FORWARDED_FOR','HTTP_CLIENT_IP','REMOTE_ADDR'];
    foreach ($candidates as $k) {
        if (!empty($_SERVER[$k])) {
            $val = $_SERVER[$k];
            if ($k === 'HTTP_X_FORWARDED_FOR') {
                $parts = explode(',', $val);
                return trim($parts[0]);
            }
            return $val;
        }
    }
    return 'unknown';
}


// ---- Start zpracování ----
$requestHeaders = getRequestHeaders();

// Vyfiltrujeme hlavièky zaèínající na "X-ResponseTest"
$responseTestHeaders = [];
foreach ($requestHeaders as $headerName => $headerValue) {
    if (stripos($headerName, 'X-ResponseTest') === 0) {
        $responseTestHeaders[$headerName] = $headerValue;
    }
}

// === Ukládání TrackingId ===
$trackingId = readHeader('X-Api-Monitor-TrackingId', $requestHeaders);

if ($ENABLE_TRACKING_LOG) {
    $trackingLogFile = 'tracking_ids.log';
    $logRecord = [
        'ts'         => date('c'),
        'ip'         => getClientIp(),
        'method'     => $_SERVER['REQUEST_METHOD'] ?? null,
        'uri'        => $_SERVER['REQUEST_URI'] ?? null,
        'trackingId' => $trackingId,
    ];
    file_put_contents(
        $trackingLogFile,
        json_encode($logRecord, JSON_UNESCAPED_SLASHES) . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}

// === Ukládání unikátního User-Agent ===
$userAgent = readHeader('User-Agent', $requestHeaders);

if ($ENABLE_USER_AGENT_LOG && $userAgent) {
    $userAgentFile = 'user_agents.txt';
    $existingAgents = file_exists($userAgentFile)
        ? file($userAgentFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)
        : [];
    if (!in_array($userAgent, $existingAgents, true)) {
        file_put_contents($userAgentFile, $userAgent . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

// === Jednoduchý persistentní counter ===
$counterFile = 'counter.txt';
if (!file_exists($counterFile)) {
    file_put_contents($counterFile, '0', LOCK_EX);
}
$counterValue = (int)file_get_contents($counterFile);
$counterValue++;
file_put_contents($counterFile, (string)$counterValue, LOCK_EX);

// === Výpoèty hodnot pro odpovìï ===
$valuezero = 0;
$valuerandompercent = rand(0, 100);
$valueincrement = $counterValue;
$valueboolswitch = ($counterValue % 2);
$valuestringtext = ($counterValue % 5 === 0)
    ? "Warning OVERFLOW"
    : (($valuerandompercent % 2 === 0) ? "Percentage is Even" : "Percentage is Odd");
$valuestringtext2 = ($counterValue % 5 === 0) ? null : (($valueboolswitch === 0) ? false : true);

// === Hlavièky odpovìdi ===
header('Cache-Control: no-cache, no-store, must-revalidate');
header('Expires: 0');
header('Content-Type: application/json');
header("Test: $valuezero");
header("Test-RandPerc: $valuerandompercent");
header("Test-RandPercText: $valuestringtext");
header("Test-Increment: $valueincrement");
header("Test-Bool: $valueboolswitch");
header("Test-BoolText: " . ($valuestringtext2 === null ? '' : ($valuestringtext2 ? 'true' : 'false')));
header("valuepair: 0;1");
header("valuepair1: 0; 1");
header("valuepair2: 42; 230; 77; 45;");
header("valuepairspace: 23 421");

// Propagace hlavièek X-Test*
foreach ($requestHeaders as $headerName => $headerValue) {
    if (stripos($headerName, 'X-Test') === 0) {
        header("$headerName: $headerValue");
    }
}

// === JSON odpovìï ===
$response = [
    "status" => "success",
    "message" => "This is a sample response",
    "received_headers" => $requestHeaders,
    "response_test_headers" => $responseTestHeaders,
    "trackingId" => $trackingId,
    "clientIp" => getClientIp(),
    "timestamp" => date('c'),
    "valuezero" => $valuezero,
    "valuerandompercent" => $valuerandompercent,
    "valuerandompercentstring" => $valuestringtext,
    "valueincrement" => $valueincrement,
    "valueboolswitch" => $valueboolswitch,
    "valueboolswitchtext" => $valuestringtext2,
    "valueempty" => "",
    "valuearray" => [1, 2, 43],
    "dummyuser" => [
        ["jmeno" => "jarda", "vek" => 45],
        ["jmeno" => "honza", "vek" => 40]
    ],
    "longvalue" => "Lorem ipsum dolor sit amet, consectetur adipisici elit, sed eiusmod tempor incidunt ut labore et dolore magna aliqua...",
    "example" => [
        "key1" => "value1",
        "key2" => "value2"
    ]
];

echo json_encode($response, JSON_PRETTY_PRINT);
