package com.mediasfu.familiarcall.protocol

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SdpProfileTest {
    @Test fun parsesAndAlignsDynamicPayloads() {
        val profile = parsePayloadProfile("audio/opus=111,video/VP8=96")
        val source = "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 109\r\na=rtpmap:109 opus/48000/2\r\nm=video 9 UDP/TLS/RTP/SAVPF 120\r\na=rtpmap:120 VP8/90000\r\n"
        val aligned = alignOfferToPayloadProfile(source, profile)
        assertTrue(aligned.contains("m=audio 9 UDP/TLS/RTP/SAVPF 111"))
        assertTrue(aligned.contains("a=rtpmap:96 VP8/90000"))
    }

    @Test fun clampsMiniToStage() {
        assertEquals(MiniOffset(-200f, 286f), clampMiniOffset(MiniOffset(-999f, 999f), 320f, 480f, 106f, 180f, 14f))
    }

    @Test fun screenOwnsPrimaryAndLocksSwap() {
        val presentation = resolvePresentation(screen = "screen", remote = "remote", local = "local", remotePrimary = false)
        assertEquals("screen", presentation.primary?.track)
        assertEquals("remote", presentation.mini?.track)
        assertTrue(presentation.screenActive)
    }
}
