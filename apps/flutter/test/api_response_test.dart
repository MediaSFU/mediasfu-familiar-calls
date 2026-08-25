import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mediasfu_familiar_call/api_response.dart';

void main() {
  final uri = Uri.parse('http://127.0.0.1:8790/api/rooms/create');

  test('returns successful JSON objects', () async {
    final result = await requestCallApiJson(
      client: MockClient(
        (_) async => http.Response(
          '{"success":true,"data":{"meetingID":"room-1"}}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
      uri: uri,
    );
    expect(result['success'], isTrue);
  });

  test('surfaces a JSON backend error', () async {
    expect(
      () => requestCallApiJson(
        client: MockClient(
          (_) async => http.Response(
            '{"success":false,"error":"Room capacity reached."}',
            409,
            reasonPhrase: 'Conflict',
          ),
        ),
        uri: uri,
      ),
      throwsA(
        isA<CallApiException>().having(
          (error) => error.message,
          'message',
          'Room capacity reached.',
        ),
      ),
    );
  });

  test('turns an HTML 404 into a backend URL error', () async {
    expect(
      () => requestCallApiJson(
        client: MockClient(
          (_) async => http.Response(
            '<!DOCTYPE html><title>Not found</title>',
            404,
            headers: {'content-type': 'text/html'},
          ),
        ),
        uri: uri,
      ),
      throwsA(
        isA<CallApiException>()
            .having((error) => error.message, 'message', contains('HTTP 404'))
            .having(
              (error) => error.message,
              'message',
              contains('CALL_API_ORIGIN'),
            ),
      ),
    );
  });

  test('reports an unreachable backend without leaking ClientException', () {
    expect(
      () => requestCallApiJson(
        client: MockClient((request) async {
          throw http.ClientException('Connection refused', request.url);
        }),
        uri: uri,
      ),
      throwsA(
        isA<CallApiException>()
            .having(
              (error) => error.message,
              'message',
              contains('Unable to connect'),
            )
            .having(
              (error) => error.message,
              'message',
              isNot(contains('ClientException')),
            ),
      ),
    );
  });

  test('reports a timeout with recovery guidance', () {
    expect(
      () => requestCallApiJson(
        client: MockClient((_) => Completer<http.Response>().future),
        uri: uri,
        timeout: const Duration(milliseconds: 1),
      ),
      throwsA(
        isA<CallApiException>().having(
          (error) => error.message,
          'message',
          contains('timed out'),
        ),
      ),
    );
  });

  test('reports a non-JSON success response as invalid', () {
    expect(
      () => requestCallApiJson(
        client: MockClient((_) async => http.Response('plain text', 200)),
        uri: uri,
      ),
      throwsA(
        isA<CallApiException>().having(
          (error) => error.message,
          'message',
          contains('expected JSON'),
        ),
      ),
    );
  });
}
