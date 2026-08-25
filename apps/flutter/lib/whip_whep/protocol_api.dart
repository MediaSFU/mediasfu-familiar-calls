import 'package:http/http.dart' as http;
import '../api_response.dart';

class ProtocolSession {
  final String id;
  final String hostUserId;
  final String targetUserId;
  final String displayName;
  final String callType;
  final String status;
  final String updatedAt;

  const ProtocolSession({
    required this.id,
    required this.hostUserId,
    required this.targetUserId,
    required this.displayName,
    required this.callType,
    required this.status,
    required this.updatedAt,
  });

  factory ProtocolSession.fromJson(Map<String, dynamic> json) =>
      ProtocolSession(
        id: '${json['id'] ?? ''}',
        hostUserId: '${json['hostUserId'] ?? ''}',
        targetUserId: '${json['targetUserId'] ?? ''}',
        displayName: '${json['displayName'] ?? ''}',
        callType: '${json['callType'] ?? 'video'}',
        status: '${json['status'] ?? 'ringing'}',
        updatedAt: '${json['updatedAt'] ?? json['createdAt'] ?? ''}',
      );
}

class ProtocolApi {
  final Uri origin;
  final http.Client client;
  ProtocolApi(String baseUrl, {http.Client? client})
    : origin = Uri.parse(baseUrl),
      client = client ?? http.Client();

  Uri _uri(String path) => origin.resolve('/api$path');

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    return requestCallApiJson(
      client: client,
      uri: _uri(path),
      method: method,
      body: body,
    );
  }

  Future<List<ProtocolSession>> listSessions(String userId) async {
    final response = await _request(
      '/users/${Uri.encodeComponent(userId)}/sessions',
    );
    return ((response['data'] as List?) ?? const [])
        .map(
          (item) =>
              ProtocolSession.fromJson(Map<String, dynamic>.from(item as Map)),
        )
        .toList();
  }

  Future<ProtocolSession> createCall({
    required String hostUserId,
    required String targetUserId,
    required String displayName,
    required String callType,
  }) async {
    final response = await _request(
      '/protocol/calls/create',
      method: 'POST',
      body: {
        'hostUserId': hostUserId,
        'targetUserId': targetUserId,
        'displayName': displayName,
        'callType': callType,
        'duration': 30,
        'capacity': 2,
        'eventType': 'conference',
      },
    );
    return ProtocolSession.fromJson(
      Map<String, dynamic>.from(response['session'] as Map),
    );
  }

  Future<ProtocolSession> acceptCall(String sessionId, String userId) async {
    final response = await _request(
      '/protocol/calls/accept',
      method: 'POST',
      body: {'sessionId': sessionId, 'userId': userId},
    );
    return ProtocolSession.fromJson(
      Map<String, dynamic>.from(response['data'] as Map),
    );
  }

  Future<Map<String, dynamic>> preparePublisher(
    String sessionId,
    String userId,
    String displayName,
  ) async {
    final response = await _request(
      '/protocol/prepare',
      method: 'POST',
      body: {
        'sessionId': sessionId,
        'userId': userId,
        'displayName': displayName,
      },
    );
    return Map<String, dynamic>.from(response['data'] as Map);
  }

  Future<Map<String, dynamic>> preparePeer(
    String sessionId,
    String userId,
  ) async {
    final response = await _request(
      '/protocol/sessions/${Uri.encodeComponent(sessionId)}/peer?userId=${Uri.encodeQueryComponent(userId)}',
    );
    return Map<String, dynamic>.from(response['data'] as Map);
  }

  Future<void> updatePresentation(
    String sessionId,
    String userId,
    bool screenActive,
  ) async {
    await _request(
      '/protocol/sessions/${Uri.encodeComponent(sessionId)}/presentation',
      method: 'POST',
      body: {'userId': userId, 'screenActive': screenActive},
    );
  }

  Future<void> endCall(
    String sessionId,
    String userId, {
    String reason = 'user_ended',
  }) async {
    await _request(
      '/sessions/${Uri.encodeComponent(sessionId)}/end',
      method: 'POST',
      body: {'userId': userId, 'reason': reason},
    );
  }

  void close() => client.close();
}
