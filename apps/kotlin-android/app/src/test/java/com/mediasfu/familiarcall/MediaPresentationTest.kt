package com.mediasfu.familiarcall

import com.mediasfu.sdk.model.Stream
import com.mediasfu.sdk.webrtc.MediaStream
import com.mediasfu.sdk.webrtc.MediaStreamTrack
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class MediaPresentationTest {
    private val localMedia = FakeMediaStream("local")
    private val remoteMedia = FakeMediaStream("remote")
    private val screenMedia = FakeMediaStream("screen")

    @Test
    fun `remote camera is primary and local camera is the mini preview`() {
        val presentation = resolveMediaPresentation(
            streams = listOf(
                Stream(producerId = "local", stream = localMedia, name = "Me"),
                Stream(producerId = "remote", stream = remoteMedia, name = "Peer"),
            ),
            localStream = localMedia,
            screenProducerId = "",
            screenParticipantName = "",
            peerLabel = "Peer",
        )

        assertEquals(SurfaceKind.REMOTE_CAMERA, presentation.primary?.kind)
        assertEquals(SurfaceKind.LOCAL_CAMERA, presentation.previews.single().kind)
        assertFalse(presentation.screenActive)
    }

    @Test
    fun `screen share remains primary while both cameras become previews`() {
        val presentation = resolveMediaPresentation(
            streams = listOf(
                Stream(producerId = "local", stream = localMedia, name = "Me"),
                Stream(producerId = "remote", stream = remoteMedia, name = "Peer"),
                Stream(producerId = "screen", stream = screenMedia, name = "Peer"),
            ),
            localStream = localMedia,
            screenProducerId = "screen",
            screenParticipantName = "Peer",
            peerLabel = "Peer",
        )

        assertEquals(SurfaceKind.SCREEN, presentation.primary?.kind)
        assertEquals(listOf(SurfaceKind.REMOTE_CAMERA, SurfaceKind.LOCAL_CAMERA), presentation.previews.map { it.kind })
        assertTrue(presentation.screenActive)
    }

    @Test
    fun `placeholder streams do not displace real media`() {
        val presentation = resolveMediaPresentation(
            streams = listOf(
                Stream(producerId = "placeholder", stream = null, name = "Peer"),
                Stream(producerId = "local", stream = localMedia, name = "Me"),
            ),
            localStream = localMedia,
            screenProducerId = "",
            screenParticipantName = "",
            peerLabel = "Peer",
        )

        assertEquals(SurfaceKind.LOCAL_CAMERA, presentation.primary?.kind)
        assertTrue(presentation.previews.isEmpty())
    }
}

private class FakeMediaStream(override val id: String) : MediaStream {
    override val active: Boolean = true
    override fun getAudioTracks(): List<MediaStreamTrack> = emptyList()
    override fun getVideoTracks(): List<MediaStreamTrack> = emptyList()
    override fun getTracks(): List<MediaStreamTrack> = emptyList()
    override fun addTrack(track: MediaStreamTrack) = Unit
    override fun removeTrack(track: MediaStreamTrack) = Unit
    override fun stop() = Unit
}
