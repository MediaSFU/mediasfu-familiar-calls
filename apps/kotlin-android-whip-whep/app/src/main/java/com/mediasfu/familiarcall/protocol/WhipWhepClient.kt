package com.mediasfu.familiarcall.protocol

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjection
import java.net.HttpURLConnection
import java.net.URI
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.Camera2Enumerator
import org.webrtc.CameraEnumerator
import org.webrtc.DataChannel
import org.webrtc.DefaultVideoDecoderFactory
import org.webrtc.DefaultVideoEncoderFactory
import org.webrtc.EglBase
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.MediaStream
import org.webrtc.MediaStreamTrack
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.RtpReceiver
import org.webrtc.RtpTransceiver
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription
import org.webrtc.ScreenCapturerAndroid
import org.webrtc.SurfaceTextureHelper
import org.webrtc.VideoCapturer
import org.webrtc.VideoSource
import org.webrtc.VideoTrack

data class LocalMedia(
    val audioTrack: AudioTrack,
    val videoTrack: VideoTrack?,
    val audioSource: AudioSource,
    val videoSource: VideoSource?,
    val capturer: VideoCapturer?,
    val textureHelper: SurfaceTextureHelper?,
)

data class RemoteMedia(val audioTrack: AudioTrack?, val videoTrack: VideoTrack?)

data class ScreenMedia(
    val videoTrack: VideoTrack,
    val videoSource: VideoSource,
    val capturer: VideoCapturer,
    val textureHelper: SurfaceTextureHelper,
)

class ProtocolResource(
    val peer: PeerConnection,
    val resourceUrl: String,
    private val token: String,
) {
    fun replaceVideoTrack(track: VideoTrack): Boolean {
        val sender = peer.senders.firstOrNull { it.track()?.kind() == MediaStreamTrack.VIDEO_TRACK_KIND }
            ?: return false
        return sender.setTrack(track, false)
    }

    suspend fun stop() {
        runCatching { sdpRequest(resourceUrl, token, "DELETE") }
        peer.close()
    }
}

class WhipWhepEngine(context: Context) {
    val eglBase: EglBase = EglBase.create()
    private val appContext = context.applicationContext
    private val factory: PeerConnectionFactory

    init {
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(appContext).createInitializationOptions(),
        )
        factory = PeerConnectionFactory.builder()
            .setVideoEncoderFactory(DefaultVideoEncoderFactory(eglBase.eglBaseContext, true, true))
            .setVideoDecoderFactory(DefaultVideoDecoderFactory(eglBase.eglBaseContext))
            .createPeerConnectionFactory()
    }

    fun capture(includeVideo: Boolean): LocalMedia {
        val audioSource = factory.createAudioSource(MediaConstraints())
        val audioTrack = factory.createAudioTrack("local-audio", audioSource).also { it.setEnabled(true) }
        if (!includeVideo) return LocalMedia(audioTrack, null, audioSource, null, null, null)
        val enumerator = Camera2Enumerator(appContext)
        val capturer = cameraCapturer(enumerator)
            ?: throw IllegalStateException("No camera is available on this Android device.")
        val helper = SurfaceTextureHelper.create("FamiliarCamera", eglBase.eglBaseContext)
        val source = factory.createVideoSource(false)
        capturer.initialize(helper, appContext, source.capturerObserver)
        capturer.startCapture(1280, 720, 30)
        val videoTrack = factory.createVideoTrack("local-video", source).also { it.setEnabled(true) }
        return LocalMedia(audioTrack, videoTrack, audioSource, source, capturer, helper)
    }

    fun captureScreen(permissionData: Intent, onStopped: () -> Unit = {}): ScreenMedia {
        val capturer = ScreenCapturerAndroid(permissionData, object : MediaProjection.Callback() {
            override fun onStop() = onStopped()
        })
        val helper = SurfaceTextureHelper.create("FamiliarScreen", eglBase.eglBaseContext)
        val source = factory.createVideoSource(true)
        capturer.initialize(helper, appContext, source.capturerObserver)
        capturer.startCapture(1280, 720, 15)
        val track = factory.createVideoTrack("local-screen", source).also { it.setEnabled(true) }
        return ScreenMedia(track, source, capturer, helper)
    }

    suspend fun publish(lease: ProtocolLease, media: LocalMedia): ProtocolResource {
        return publish(lease, media.audioTrack, media.videoTrack)
    }

    suspend fun publish(
        lease: ProtocolLease,
        audioTrack: AudioTrack,
        videoTrack: VideoTrack?,
    ): ProtocolResource {
        val iceComplete = CompletableDeferred<Unit>()
        val peer = newPeer(iceComplete)
        peer.addTrack(audioTrack, listOf("familiar"))
        videoTrack?.let { peer.addTrack(it, listOf("familiar")) }
        return try {
            val offer = peer.createOfferAwait()
            peer.setLocalAwait(offer)
            withTimeout(12_000) { iceComplete.await() }
            val local = peer.localDescription ?: throw IllegalStateException("WHIP local description is missing.")
            val response = sdpRequest(lease.url, lease.token, "POST", local.description)
            require(response.status == 201) { "WHIP publish was refused (${response.status})." }
            val resource = response.location ?: throw IllegalStateException("WHIP response omitted its resource URL.")
            peer.setRemoteAwait(SessionDescription(SessionDescription.Type.ANSWER, response.body))
            ProtocolResource(peer, URI.create(lease.url).resolve(resource).toString(), lease.token)
        } catch (error: Throwable) {
            peer.close(); throw error
        }
    }

    suspend fun consume(lease: ProtocolLease, onRemote: (RemoteMedia) -> Unit): ProtocolResource {
        val iceComplete = CompletableDeferred<Unit>()
        var remoteAudio: AudioTrack? = null
        var remoteVideo: VideoTrack? = null
        val peer = newPeer(iceComplete) { track ->
            when (track) {
                is AudioTrack -> remoteAudio = track.also { it.setEnabled(true) }
                is VideoTrack -> remoteVideo = track.also { it.setEnabled(true) }
            }
            onRemote(RemoteMedia(remoteAudio, remoteVideo))
        }
        lease.tracks.forEach { kind ->
            val type = if (kind == "audio") MediaStreamTrack.MediaType.MEDIA_TYPE_AUDIO else MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO
            peer.addTransceiver(type, RtpTransceiver.RtpTransceiverInit(RtpTransceiver.RtpTransceiverDirection.RECV_ONLY))
        }
        return try {
            val profileResponse = sdpRequest(lease.url, lease.token, "GET")
            require(profileResponse.status in 200..299) { "WHEP profile request failed (${profileResponse.status})." }
            val profile = parsePayloadProfile(profileResponse.profile)
            val offer = peer.createOfferAwait()
            val aligned = alignOfferToPayloadProfile(offer.description, profile)
            peer.setLocalAwait(SessionDescription(SessionDescription.Type.OFFER, aligned))
            withTimeout(12_000) { iceComplete.await() }
            val local = peer.localDescription ?: throw IllegalStateException("WHEP local description is missing.")
            val response = sdpRequest(lease.url, lease.token, "POST", local.description)
            require(response.status == 201) { "WHEP playback was refused (${response.status})." }
            val resource = response.location ?: throw IllegalStateException("WHEP response omitted its resource URL.")
            peer.setRemoteAwait(SessionDescription(SessionDescription.Type.ANSWER, response.body))
            ProtocolResource(peer, URI.create(lease.url).resolve(resource).toString(), lease.token)
        } catch (error: Throwable) {
            peer.close(); throw error
        }
    }

    fun releaseLocal(media: LocalMedia?) {
        media ?: return
        runCatching { media.capturer?.stopCapture() }
        media.capturer?.dispose()
        media.videoTrack?.dispose()
        media.audioTrack.dispose()
        media.videoSource?.dispose()
        media.audioSource.dispose()
        media.textureHelper?.dispose()
    }

    fun releaseScreen(media: ScreenMedia?) {
        media ?: return
        runCatching { media.capturer.stopCapture() }
        media.capturer.dispose()
        media.videoTrack.dispose()
        media.videoSource.dispose()
        media.textureHelper.dispose()
    }

    fun dispose() { factory.dispose(); eglBase.release() }

    private fun newPeer(iceComplete: CompletableDeferred<Unit>, onTrack: (MediaStreamTrack) -> Unit = {}): PeerConnection {
        val config = PeerConnection.RTCConfiguration(emptyList()).apply {
            bundlePolicy = PeerConnection.BundlePolicy.MAXBUNDLE
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
        }
        return factory.createPeerConnection(config, object : PeerObserver() {
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {
                if (state == PeerConnection.IceGatheringState.COMPLETE) iceComplete.complete(Unit)
            }
            override fun onTrack(transceiver: RtpTransceiver?) {
                transceiver?.receiver?.track()?.let(onTrack)
            }
        }) ?: throw IllegalStateException("Could not create WebRTC peer connection.")
    }

    private fun cameraCapturer(enumerator: CameraEnumerator): VideoCapturer? {
        val selected = enumerator.deviceNames.firstOrNull(enumerator::isFrontFacing)
            ?: enumerator.deviceNames.firstOrNull()
        return selected?.let { enumerator.createCapturer(it, null) }
    }
}

private open class PeerObserver : PeerConnection.Observer {
    override fun onSignalingChange(state: PeerConnection.SignalingState?) = Unit
    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) = Unit
    override fun onIceConnectionReceivingChange(receiving: Boolean) = Unit
    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) = Unit
    override fun onIceCandidate(candidate: IceCandidate?) = Unit
    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) = Unit
    override fun onAddStream(stream: MediaStream?) = Unit
    override fun onRemoveStream(stream: MediaStream?) = Unit
    override fun onDataChannel(channel: DataChannel?) = Unit
    override fun onRenegotiationNeeded() = Unit
    override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) = Unit
}

private suspend fun PeerConnection.createOfferAwait(): SessionDescription {
    val result = CompletableDeferred<SessionDescription>()
    createOffer(object : SimpleSdpObserver() {
        override fun onCreateSuccess(description: SessionDescription?) {
            if (description == null) result.completeExceptionally(IllegalStateException("WebRTC returned no offer."))
            else result.complete(description)
        }
        override fun onCreateFailure(message: String?) {
            result.completeExceptionally(IllegalStateException(message ?: "Offer failed."))
        }
    }, MediaConstraints())
    return result.await()
}

private suspend fun PeerConnection.setLocalAwait(description: SessionDescription) = setAwait(true, description)
private suspend fun PeerConnection.setRemoteAwait(description: SessionDescription) = setAwait(false, description)

private suspend fun PeerConnection.setAwait(local: Boolean, description: SessionDescription) {
    val result = CompletableDeferred<Unit>()
    val observer = object : SimpleSdpObserver() {
        override fun onSetSuccess() { result.complete(Unit) }
        override fun onSetFailure(message: String?) {
            result.completeExceptionally(IllegalStateException(message ?: "SDP assignment failed."))
        }
    }
    if (local) setLocalDescription(observer, description) else setRemoteDescription(observer, description)
    result.await()
}

private open class SimpleSdpObserver : SdpObserver {
    override fun onCreateSuccess(description: SessionDescription?) = Unit
    override fun onSetSuccess() = Unit
    override fun onCreateFailure(message: String?) = Unit
    override fun onSetFailure(message: String?) = Unit
}

private data class SdpResponse(val status: Int, val body: String, val location: String?, val profile: String?)

private suspend fun sdpRequest(url: String, token: String, method: String, body: String? = null): SdpResponse =
    withContext(Dispatchers.IO) {
        val connection = URI.create(url).toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/sdp")
                connection.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            SdpResponse(
                status = status,
                body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty(),
                location = connection.getHeaderField("Location"),
                profile = connection.getHeaderField(WHEP_PROFILE_HEADER),
            )
        } finally { connection.disconnect() }
    }
