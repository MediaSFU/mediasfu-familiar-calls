package com.mediasfu.familiarcall

import com.mediasfu.sdk.model.Stream
import com.mediasfu.sdk.webrtc.MediaStream

enum class SurfaceKind { SCREEN, REMOTE_CAMERA, LOCAL_CAMERA }

data class MediaSurface(
    val source: Stream,
    val kind: SurfaceKind,
    val label: String,
) {
    val isLocal: Boolean get() = kind == SurfaceKind.LOCAL_CAMERA
    val isScreen: Boolean get() = kind == SurfaceKind.SCREEN
}

data class MediaPresentation(
    val primary: MediaSurface?,
    val previews: List<MediaSurface>,
    val screenActive: Boolean,
)

/**
 * Framework-local projection of the shared familiar-call media contract:
 * screen share first, then remote camera, then local camera. Empty/placeholder
 * streams never occupy a visible surface.
 */
fun resolveMediaPresentation(
    streams: List<Stream>,
    localStream: MediaStream?,
    screenProducerId: String,
    screenParticipantName: String,
    peerLabel: String,
): MediaPresentation {
    val visible = streams.filter { it.stream != null }
    val screen = visible.firstOrNull {
        screenProducerId.isNotBlank() && (it.producerId == screenProducerId || it.id == screenProducerId)
    } ?: visible.firstOrNull {
        screenParticipantName.isNotBlank() && it.name == screenParticipantName
    }
    val local = visible.firstOrNull { candidate ->
        localStream != null && candidate.stream === localStream
    }
    val remotes = visible.filterNot { it === screen || it === local }

    val screenSurface = screen?.let { MediaSurface(it, SurfaceKind.SCREEN, "Screen share") }
    val localSurface = local?.let { MediaSurface(it, SurfaceKind.LOCAL_CAMERA, "You") }
    val remoteSurfaces = remotes.mapIndexed { index, stream ->
        MediaSurface(
            source = stream,
            kind = SurfaceKind.REMOTE_CAMERA,
            label = stream.name?.takeIf(String::isNotBlank)
                ?: if (index == 0) peerLabel else "$peerLabel ${index + 1}",
        )
    }

    return when {
        screenSurface != null -> MediaPresentation(
            primary = screenSurface,
            previews = remoteSurfaces + listOfNotNull(localSurface),
            screenActive = true,
        )
        remoteSurfaces.isNotEmpty() -> MediaPresentation(
            primary = remoteSurfaces.first(),
            previews = remoteSurfaces.drop(1) + listOfNotNull(localSurface),
            screenActive = false,
        )
        localSurface != null -> MediaPresentation(localSurface, emptyList(), false)
        else -> MediaPresentation(null, emptyList(), false)
    }
}
