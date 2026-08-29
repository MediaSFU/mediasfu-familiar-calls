import Foundation

struct FamiliarIdentity: Codable, Equatable {
  var userId: String
  var displayName: String
}

struct FamiliarSession: Codable, Identifiable, Equatable {
  let id: String
  let hostUserId: String
  let targetUserId: String
  let displayName: String
  let meetingId: String
  let callType: String
  let status: String
  let eventType: String
  let createdAt: String
  let updatedAt: String
}

enum FamiliarAPIError: LocalizedError {
  case invalidURL, invalidResponse
  case server(String)
  case unavailable
  var errorDescription: String? {
    switch self {
    case .invalidURL: return "The call service URL is invalid."
    case .invalidResponse: return "The call service returned an invalid response."
    case .server(let message): return message
    case .unavailable: return "Unable to reach the call service."
    }
  }
}

@MainActor
final class FamiliarCallsAPI {
  let origin: URL
  private let decoder = JSONDecoder()

  init(
    origin: URL? = URL(
      string: ProcessInfo.processInfo.environment["CALL_API_ORIGIN"] ?? "http://127.0.0.1:8790")!
  ) {
    self.origin = origin ?? URL(string: "http://127.0.0.1:8790")!
  }

  func sessions(for userId: String) async throws -> [FamiliarSession] {
    let payload: SessionListResponse = try await request(
      path:
        "/api/users/\(userId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? userId)/sessions"
    )
    return payload.data.sorted { $0.updatedAt > $1.updatedAt }
  }

  func create(hostUserId: String, targetUserId: String, displayName: String, callType: String)
    async throws -> (FamiliarSession, [String: Any])
  {
    let body: [String: Any] = [
      "hostUserId": hostUserId, "targetUserId": targetUserId, "displayName": displayName,
      "callType": callType, "duration": 30, "capacity": 2, "eventType": "conference",
    ]
    let response = try await requestRaw(path: "/api/rooms/create", method: "POST", body: body)
    return (
      try decode(FamiliarSession.self, from: response["session"]),
      response["data"] as? [String: Any] ?? [:]
    )
  }

  func join(sessionId: String, userId: String, displayName: String) async throws -> (
    FamiliarSession, [String: Any]
  ) {
    let body: [String: Any] = [
      "sessionId": sessionId, "userId": userId, "displayName": displayName,
    ]
    let response = try await requestRaw(path: "/api/rooms/join", method: "POST", body: body)
    return (
      try decode(FamiliarSession.self, from: response["session"]),
      response["data"] as? [String: Any] ?? [:]
    )
  }

  func end(sessionId: String, userId: String, reason: String = "user_ended") async throws {
    _ = try await requestRaw(
      path: "/api/sessions/\(sessionId)/end", method: "POST",
      body: ["userId": userId, "reason": reason])
  }

  private struct SessionListResponse: Decodable { let data: [FamiliarSession] }
  private func request<T: Decodable>(path: String) async throws -> T {
    let object = try await requestRaw(path: path)
    return try decode(T.self, from: object)
  }
  private func decode<T: Decodable>(_ type: T.Type, from value: Any?) throws -> T {
    guard let value else { throw FamiliarAPIError.invalidResponse }
    guard JSONSerialization.isValidJSONObject(value) else { throw FamiliarAPIError.invalidResponse }
    return try decoder.decode(T.self, from: JSONSerialization.data(withJSONObject: value))
  }
  private func requestRaw(path: String, method: String = "GET", body: [String: Any]? = nil)
    async throws -> [String: Any]
  {
    guard let url = URL(string: path, relativeTo: origin)?.absoluteURL else {
      throw FamiliarAPIError.invalidURL
    }
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue(UUID().uuidString, forHTTPHeaderField: "Idempotency-Key")
    if let body { request.httpBody = try JSONSerialization.data(withJSONObject: body) }
    do {
      let (data, response) = try await URLSession.shared.data(for: request)
      guard let http = response as? HTTPURLResponse else { throw FamiliarAPIError.invalidResponse }
      let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
      if !(200..<300).contains(http.statusCode) || (object["success"] as? Bool) == false {
        throw FamiliarAPIError.server(
          object["error"] as? String ?? "The call service could not complete the request.")
      }
      return object
    } catch let error as FamiliarAPIError { throw error } catch {
      throw FamiliarAPIError.unavailable
    }
  }
}
