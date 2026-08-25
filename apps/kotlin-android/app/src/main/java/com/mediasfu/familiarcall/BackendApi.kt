package com.mediasfu.familiarcall

import com.mediasfu.sdk.methods.utils.CreateJoinRoomResponse
import com.mediasfu.sdk.methods.utils.CreateJoinRoomResult
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class CallSession(
    val id: String,
    val hostUserId: String,
    val targetUserId: String,
    val displayName: String,
    val meetingId: String,
    val callType: String,
    val status: String,
    val createdAt: String,
    val updatedAt: String,
)

data class RoomProvision(
    val session: CallSession,
    val roomResult: CreateJoinRoomResult,
)

class BackendApi(baseUrl: String) {
    private val origin = baseUrl.trimEnd('/')

    suspend fun sessions(userId: String): List<CallSession> {
        val encoded = URLEncoder.encode(userId, Charsets.UTF_8.name())
        val json = request("GET", "/api/users/$encoded/sessions")
        return json.optJSONArray("data").toSessions()
    }

    suspend fun createCall(
        identity: Identity,
        targetUserId: String,
        callType: String,
    ): RoomProvision {
        val response = request(
            "POST",
            "/api/rooms/create",
            JSONObject()
                .put("hostUserId", identity.userId)
                .put("targetUserId", targetUserId)
                .put("displayName", identity.displayName)
                .put("duration", 30)
                .put("capacity", 2)
                .put("eventType", "conference")
                .put("callType", callType),
        )
        return response.toProvision()
    }

    suspend fun joinCall(identity: Identity, session: CallSession): RoomProvision {
        val response = request(
            "POST",
            "/api/rooms/join",
            JSONObject()
                .put("sessionId", session.id)
                .put("userId", identity.userId)
                .put("displayName", identity.displayName),
        )
        return response.toProvision()
    }

    suspend fun endCall(sessionId: String, userId: String, reason: String = "user_ended") {
        val encoded = URLEncoder.encode(sessionId, Charsets.UTF_8.name())
        request(
            "POST",
            "/api/sessions/$encoded/end",
            JSONObject().put("userId", userId).put("reason", reason),
        )
    }

    private suspend fun request(method: String, path: String, body: JSONObject? = null): JSONObject =
        withContext(Dispatchers.IO) {
            val connection = URI.create("$origin$path").toURL().openConnection() as HttpURLConnection
            try {
                connection.requestMethod = method
                connection.connectTimeout = 15_000
                connection.readTimeout = 30_000
                connection.setRequestProperty("Accept", "application/json")
                if (body != null) {
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body.toString()) }
                }
                val status = connection.responseCode
                val stream = if (status in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
                    .trimStart('\uFEFF')
                val payload = runCatching { JSONObject(text.ifBlank { "{}" }) }.getOrElse { JSONObject() }
                if (status !in 200..299 || !payload.optBoolean("success", status in 200..299)) {
                    throw IllegalStateException(payload.optString("error", "The call backend returned HTTP $status."))
                }
                payload
            } finally {
                connection.disconnect()
            }
        }

    private fun JSONObject.toProvision(): RoomProvision {
        val session = optJSONObject("session")?.toSession()
            ?: throw IllegalStateException("The backend response did not include a call session.")
        val room = optJSONObject("data")
            ?: throw IllegalStateException("The backend response did not include room-scoped credentials.")
        val roomName = room.optString("roomName")
        val secret = room.optString("secret")
        val link = room.optString("link", room.optString("publicURL"))
        if (roomName.isBlank() || secret.isBlank() || link.isBlank()) {
            throw IllegalStateException("The backend returned an incomplete MediaSFU room response.")
        }
        return RoomProvision(
            session = session,
            roomResult = CreateJoinRoomResult(
                success = true,
                data = CreateJoinRoomResponse(
                    message = room.optString("message", "Room ready"),
                    roomName = roomName,
                    secureCode = room.optString("secureCode").ifBlank { null },
                    publicURL = room.optString("publicURL", link),
                    link = link,
                    secret = secret,
                    success = true,
                ),
            ),
        )
    }
}

private fun JSONArray?.toSessions(): List<CallSession> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            optJSONObject(index)?.let { add(it.toSession()) }
        }
    }
}

private fun JSONObject.toSession() = CallSession(
    id = optString("id"),
    hostUserId = optString("hostUserId"),
    targetUserId = optString("targetUserId"),
    displayName = optString("displayName"),
    meetingId = optString("meetingId"),
    callType = optString("callType", "video"),
    status = optString("status", "ringing"),
    createdAt = optString("createdAt"),
    updatedAt = optString("updatedAt"),
)
