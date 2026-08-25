import 'package:http/http.dart' as http;
import 'api_response.dart';

const _configuredOrigin = String.fromEnvironment(
  'CALL_API_ORIGIN',
  defaultValue: '',
);

final _sessionClient = http.Client();

class CallSession {
  final String id,
      hostUserId,
      targetUserId,
      displayName,
      meetingId,
      status,
      eventType,
      createdAt,
      updatedAt;
  const CallSession({
    required this.id,
    required this.hostUserId,
    required this.targetUserId,
    required this.displayName,
    required this.meetingId,
    required this.status,
    required this.eventType,
    required this.createdAt,
    required this.updatedAt,
  });
  factory CallSession.fromJson(Map<String, dynamic> json) => CallSession(
    id: '${json['id'] ?? ''}',
    hostUserId: '${json['hostUserId'] ?? ''}',
    targetUserId: '${json['targetUserId'] ?? ''}',
    displayName: '${json['displayName'] ?? ''}',
    meetingId: '${json['meetingId'] ?? ''}',
    status: '${json['status'] ?? ''}',
    eventType: '${json['eventType'] ?? 'conference'}',
    createdAt: '${json['createdAt'] ?? ''}',
    updatedAt: '${json['updatedAt'] ?? ''}',
  );
}

class SessionRoomResponse {
  final Map<String, dynamic> data;
  final CallSession session;
  const SessionRoomResponse(this.data, this.session);
}

Uri _uri(String path) {
  final base = _configuredOrigin.isEmpty
      ? Uri.base
      : Uri.parse(_configuredOrigin);
  return base.resolve('/api$path');
}

Future<Map<String, dynamic>> _request(
  String path, {
  String method = 'GET',
  Map<String, dynamic>? body,
}) async {
  return requestCallApiJson(
    client: _sessionClient,
    uri: _uri(path),
    method: method,
    body: body,
  );
}

Future<List<CallSession>> listSessions(String userId) async {
  final result = await _request(
    '/users/${Uri.encodeComponent(userId)}/sessions',
  );
  return ((result['data'] as List?) ?? const [])
      .map(
        (item) => CallSession.fromJson(Map<String, dynamic>.from(item as Map)),
      )
      .toList();
}

Future<SessionRoomResponse> createSession({
  required String hostUserId,
  required String targetUserId,
  required String displayName,
}) async {
  final result = await _request(
    '/rooms/create',
    method: 'POST',
    body: {
      'hostUserId': hostUserId,
      'targetUserId': targetUserId,
      'displayName': displayName,
      'duration': 30,
      'capacity': 2,
      'eventType': 'conference',
    },
  );
  return SessionRoomResponse(
    Map<String, dynamic>.from(result['data'] as Map),
    CallSession.fromJson(Map<String, dynamic>.from(result['session'] as Map)),
  );
}

Future<SessionRoomResponse> joinSession({
  required String sessionId,
  required String userId,
  required String displayName,
}) async {
  final result = await _request(
    '/rooms/join',
    method: 'POST',
    body: {
      'sessionId': sessionId,
      'userId': userId,
      'displayName': displayName,
    },
  );
  return SessionRoomResponse(
    Map<String, dynamic>.from(result['data'] as Map),
    CallSession.fromJson(Map<String, dynamic>.from(result['session'] as Map)),
  );
}

Future<CallSession> endSession(
  String sessionId,
  String userId, {
  String reason = 'user_ended',
}) async {
  final result = await _request(
    '/sessions/${Uri.encodeComponent(sessionId)}/end',
    method: 'POST',
    body: {'userId': userId, 'reason': reason},
  );
  return CallSession.fromJson(Map<String, dynamic>.from(result['data'] as Map));
}
