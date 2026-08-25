import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

class CallApiException implements Exception {
  final String message;

  const CallApiException(this.message);

  @override
  String toString() => message;
}

String _serviceLabel(Uri uri) => uri.hasAuthority ? uri.authority : 'backend';

bool _looksLikeHtml(http.Response response) {
  final contentType = response.headers['content-type']?.toLowerCase() ?? '';
  final body = response.body.trimLeft().toLowerCase();
  return contentType.contains('text/html') ||
      body.startsWith('<!doctype html') ||
      body.startsWith('<html');
}

String _httpFailure(http.Response response) {
  final reason = response.reasonPhrase?.trim();
  final suffix = reason == null || reason.isEmpty ? '' : ' ($reason)';
  return 'The call service returned HTTP ${response.statusCode}$suffix. '
      'Try again shortly.';
}

CallApiException _invalidResponse(http.Response response, Uri uri) {
  if (_looksLikeHtml(response)) {
    final status = response.statusCode >= 300
        ? ' HTTP ${response.statusCode}'
        : '';
    return CallApiException(
      'The call service at ${_serviceLabel(uri)} returned$status HTML instead '
      'of JSON. Check that CALL_API_ORIGIN points to the backend, not the '
      'frontend.',
    );
  }
  return CallApiException(
    'The call service returned an invalid response (expected JSON).',
  );
}

Future<Map<String, dynamic>> requestCallApiJson({
  required http.Client client,
  required Uri uri,
  String method = 'GET',
  Map<String, dynamic>? body,
  Duration timeout = const Duration(seconds: 20),
}) async {
  final headers = const {'content-type': 'application/json'};
  late http.Response response;
  try {
    response =
        await (method == 'POST'
                ? client.post(uri, headers: headers, body: jsonEncode(body))
                : client.get(uri, headers: headers))
            .timeout(timeout);
  } on TimeoutException {
    throw const CallApiException(
      'The call service timed out. Check your connection and try again.',
    );
  } on http.ClientException {
    throw CallApiException(
      'Unable to connect to the call service at ${_serviceLabel(uri)}. '
      'Check that the backend is running and reachable.',
    );
  }

  Map<String, dynamic>? decoded;
  if (response.body.trim().isEmpty) {
    decoded = <String, dynamic>{};
  } else {
    try {
      final value = jsonDecode(response.body);
      if (value is Map) decoded = Map<String, dynamic>.from(value);
    } on FormatException {
      throw _invalidResponse(response, uri);
    }
    if (decoded == null) throw _invalidResponse(response, uri);
  }

  final error = decoded['error'] ?? decoded['message'];
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw CallApiException(
      error is String && error.trim().isNotEmpty
          ? error.trim()
          : _httpFailure(response),
    );
  }
  if (decoded['success'] == false) {
    throw CallApiException(
      error is String && error.trim().isNotEmpty
          ? error.trim()
          : 'The call service could not complete the request.',
    );
  }
  return decoded;
}
