package com.mediasfu.familiarcall.protocol

import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class Identity(val displayName: String, val userId: String)

data class CallSession(
    val id: String,
    val hostUserId: String,
    val targetUserId: String,
    val displayName: String,
    val callType: String,
    val status: String,
)

data class ProtocolLease(val url: String, val token: String, val tracks: List<String>)
data class PeerLease(
    val ready: Boolean,
    val reason: String,
    val playback: ProtocolLease?,
    val screenActive: Boolean,
)

class BackendApi(baseUrl: String) {
    private val origin = baseUrl.trimEnd('/')

    suspend fun sessions(userId: String): List<CallSession> {
        val id = URLEncoder.encode(userId, Charsets.UTF_8.name())
        return request("GET", "/api/users/$id/sessions").optJSONArray("data").toSessions()
    }

    suspend fun createCall(
        identity: Identity,
        targetUserId: String,
        callType: String,
        requestId: String,
    ): CallSession =
        request(
            "POST", "/api/protocol/calls/create",
            JSONObject()
                .put("hostUserId", identity.userId)
                .put("targetUserId", targetUserId)
                .put("displayName", identity.displayName)
                .put("duration", 30)
                .put("capacity", 2)
                .put("eventType", "conference")
                .put("callType", callType)
                .put("requestId", requestId),
        ).requiredSession("session")

    suspend fun acceptCall(identity: Identity, session: CallSession): CallSession =
        request(
            "POST", "/api/protocol/calls/accept",
            JSONObject().put("sessionId", session.id).put("userId", identity.userId),
        ).requiredSession("data")

    suspend fun preparePublisher(identity: Identity, sessionId: String): ProtocolLease {
        val payload = request(
            "POST", "/api/protocol/prepare",
            JSONObject()
                .put("sessionId", sessionId)
                .put("userId", identity.userId)
                .put("displayName", identity.displayName),
        )
        return payload.optJSONObject("data")?.optJSONObject("publisher").toLease()
    }

    suspend fun preparePeer(identity: Identity, sessionId: String): PeerLease {
        val session = URLEncoder.encode(sessionId, Charsets.UTF_8.name())
        val user = URLEncoder.encode(identity.userId, Charsets.UTF_8.name())
        val data = request("GET", "/api/protocol/sessions/$session/peer?userId=$user").optJSONObject("data")
            ?: throw IllegalStateException("The backend omitted peer state.")
        return PeerLease(
            ready = data.optBoolean("ready"),
            reason = data.optString("reason"),
            playback = data.optJSONObject("playback")?.toLease(),
            screenActive = data.optJSONObject("peerPresentation")?.optBoolean("screenActive") == true,
        )
    }

    suspend fun updatePresentation(sessionId: String, userId: String, screenActive: Boolean) {
        val session = URLEncoder.encode(sessionId, Charsets.UTF_8.name())
        request(
            "POST",
            "/api/protocol/sessions/$session/presentation",
            JSONObject().put("userId", userId).put("screenActive", screenActive),
        )
    }

    suspend fun endCall(sessionId: String, userId: String, reason: String = "user_ended") {
        val session = URLEncoder.encode(sessionId, Charsets.UTF_8.name())
        request("POST", "/api/sessions/$session/end", JSONObject().put("userId", userId).put("reason", reason))
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
                val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty().trimStart('\uFEFF')
                val payload = runCatching { JSONObject(raw.ifBlank { "{}" }) }.getOrElse { JSONObject() }
                if (status !in 200..299 || !payload.optBoolean("success", status in 200..299)) {
                    throw IllegalStateException(payload.optString("error", "The call backend returned HTTP $status."))
                }
                payload
            } finally {
                connection.disconnect()
            }
        }
}

private fun JSONObject.requiredSession(key: String) = optJSONObject(key)?.toSession()
    ?: throw IllegalStateException("The backend omitted the call session.")

private fun JSONObject.toSession() = CallSession(
    id = optString("id"), hostUserId = optString("hostUserId"), targetUserId = optString("targetUserId"),
    displayName = optString("displayName"), callType = optString("callType", "video"), status = optString("status", "ringing"),
)

private fun JSONObject?.toLease(): ProtocolLease {
    val value = this ?: throw IllegalStateException("The backend omitted the protocol lease.")
    val url = value.optString("url")
    val token = value.optString("token")
    if (!url.startsWith("https://") || token.isBlank()) throw IllegalStateException("The backend returned an invalid protocol lease.")
    return ProtocolLease(url, token, value.optJSONArray("tracks").toStrings())
}

private fun JSONArray?.toStrings() = buildList {
    if (this@toStrings != null) for (index in 0 until length()) add(optString(index))
}.filter { it == "audio" || it == "video" }

private fun JSONArray?.toSessions() = buildList {
    if (this@toSessions != null) for (index in 0 until length()) optJSONObject(index)?.let { add(it.toSession()) }
}
