package com.mediasfu.familiarcall.protocol

enum class SurfaceKind { SCREEN, REMOTE, LOCAL }

data class VideoSurface<T : Any>(val kind: SurfaceKind, val track: T, val label: String)

data class Presentation<T : Any>(
    val primary: VideoSurface<T>?,
    val mini: VideoSurface<T>?,
    val screenActive: Boolean,
)

/**
 * Renderer-independent media projection. A MediaProjection capture host can
 * supply its screen track without changing WHIP/WHEP or Compose call state.
 */
fun <T : Any> resolvePresentation(screen: T?, remote: T?, local: T?, remotePrimary: Boolean): Presentation<T> {
    if (screen != null) return Presentation(
        primary = VideoSurface(SurfaceKind.SCREEN, screen, "Screen share"),
        mini = remote?.let { VideoSurface(SurfaceKind.REMOTE, it, "Caller") }
            ?: local?.let { VideoSurface(SurfaceKind.LOCAL, it, "You") },
        screenActive = true,
    )
    val remoteSurface = remote?.let { VideoSurface(SurfaceKind.REMOTE, it, "Caller") }
    val localSurface = local?.let { VideoSurface(SurfaceKind.LOCAL, it, "You") }
    return if (remotePrimary && remoteSurface != null) Presentation(remoteSurface, localSurface, false)
    else Presentation(localSurface ?: remoteSurface, if (localSurface != null) remoteSurface else null, false)
}
