package com.mediasfu.familiarcall.protocol

const val WHEP_PROFILE_HEADER = "x-mediasfu-rtp-payload-types"

fun parsePayloadProfile(value: String?): Map<String, Int> = buildMap {
    value.orEmpty().split(',').forEach { entry ->
        val parts = entry.trim().split('=', limit = 2)
        val payload = parts.getOrNull(1)?.toIntOrNull()
        if (parts.size == 2 && payload != null) put(parts[0].lowercase(), payload)
    }
}

private fun chooseCodecPayload(section: String, mimeType: String): Int? {
    val codec = mimeType.substringAfter('/')
    val payloads = Regex("(?im)^a=rtpmap:(\\d+)\\s+([^/\\s]+)/\\d+(?:/\\d+)?\\s*$")
        .findAll(section).filter { it.groupValues[2].equals(codec, true) }
        .map { it.groupValues[1].toInt() }.toList()
    if (!mimeType.equals("video/h264", true)) return payloads.firstOrNull()
    val packetized = payloads.filter { payload ->
        val fmtp = Regex("(?im)^a=fmtp:$payload\\s+([^\\r\\n]+)$").find(section)?.groupValues?.get(1).orEmpty()
        Regex("(?:^|;)packetization-mode=1(?:;|$)", RegexOption.IGNORE_CASE).containsMatchIn(fmtp)
    }
    return packetized.firstOrNull { payload ->
        Regex("(?im)^a=fmtp:$payload\\s+[^\\r\\n]*profile-level-id=42e").containsMatchIn(section)
    } ?: packetized.firstOrNull() ?: payloads.firstOrNull()
}

private fun remapPayloadType(sectionValue: String, mimeType: String, target: Int): String {
    var section = sectionValue
    val assigned = Regex("(?im)^a=rtpmap:$target\\s+([^/\\s]+)/").find(section)?.groupValues?.get(1)?.lowercase()
    val codec = mimeType.substringAfter('/').lowercase()
    if (assigned == codec) return section
    require(assigned == null) { "WHEP payload type $target is already assigned to $assigned." }
    val source = chooseCodecPayload(section, mimeType) ?: return section
    if (source == target) return section
    val match = Regex("(?im)^m=([^\\r\\n]+)$").find(section) ?: return section
    val fields = match.value.split(Regex("\\s+")).toMutableList()
    val index = fields.indexOf(source.toString())
    if (index < 0) return section
    fields[index] = target.toString()
    section = section.replaceRange(match.range, fields.joinToString(" "))
    section = section.replace(Regex("(?im)^(a=(?:rtpmap|fmtp|rtcp-fb):)$source(?=[ \\r]|$)"), "\$1$target")
    return section.replace(Regex("(\\bapt=)$source(?=;|\\s|$)", RegexOption.IGNORE_CASE), "\$1$target")
}

fun alignOfferToPayloadProfile(sdp: String, profile: Map<String, Int>): String {
    require(profile.isNotEmpty()) { "The WHEP endpoint omitted its RTP payload profile." }
    val supported = setOf("audio/opus", "audio/pcmu", "audio/pcma", "video/vp8", "video/vp9", "video/h264")
    val boundaries = Regex("(?=m=)").split(sdp)
    return boundaries.joinToString("") { initial ->
        var section = initial
        val kind = Regex("(?im)^m=(audio|video)\\s").find(section)?.groupValues?.get(1)?.lowercase()
        if (kind != null) profile.forEach { (mimeType, payload) ->
            if (mimeType in supported && mimeType.startsWith("$kind/")) section = remapPayloadType(section, mimeType, payload)
        }
        section
    }
}

data class MiniOffset(val x: Float, val y: Float)

fun clampMiniOffset(offset: MiniOffset, stageWidth: Float, stageHeight: Float, miniWidth: Float, miniHeight: Float, gap: Float): MiniOffset {
    val baseLeft = (stageWidth - miniWidth - gap).coerceAtLeast(0f)
    return MiniOffset(
        x = offset.x.coerceIn(-baseLeft, gap),
        y = offset.y.coerceIn(-gap, (stageHeight - miniHeight - gap).coerceAtLeast(-gap)),
    )
}
