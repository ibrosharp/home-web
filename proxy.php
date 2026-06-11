<?php
// AURA Hardware Dashboard - CORS Proxy

// Enable CORS for the dashboard
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Handle preflight OPTIONS requests immediately
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// Get the target URL from the query string
if (!isset($_GET['url'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing url parameter']);
    exit;
}

$targetUrl = urldecode($_GET['url']);

// Prepare the stream context options for forwarding the request
$options = [
    'http' => [
        'method'  => $_SERVER['REQUEST_METHOD'],
        'header'  => "Content-Type: application/json\r\n",
        'ignore_errors' => true,
        'timeout' => 5
    ]
];

// Forward request body if this is a POST/PUT request
if ($_SERVER['REQUEST_METHOD'] === 'POST' || $_SERVER['REQUEST_METHOD'] === 'PUT') {
    $options['http']['content'] = file_get_contents('php://input');
}

// Perform the request to the IoT device
$context  = stream_context_create($options);
$response = @file_get_contents($targetUrl, false, $context);

if ($response === false) {
    http_response_code(502);
    echo json_encode(['error' => 'Failed to connect to device']);
    exit;
}

// Forward the status code and content type from the device
if (isset($http_response_header)) {
    foreach ($http_response_header as $header) {
        if (preg_match('#^HTTP/#', $header)) {
            header($header);
        } else if (stripos($header, 'Content-Type:') === 0) {
            header($header);
        }
    }
} else {
    header('Content-Type: application/json');
}

// The IoT device returns invalid JSON containing hex numbers (e.g. 0x40)
// We must convert these to decimal integers so the browser's JSON.parse() can read it
$clean_response = preg_replace_callback('/:\s*0x([0-9a-fA-F]+)/', function($matches) {
    return ': ' . hexdec($matches[1]);
}, $response);

echo $clean_response;
?>
