package com.mediasfu.familiarcall.protocol

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.webrtc.EglBase
import org.webrtc.SurfaceViewRenderer
import org.webrtc.VideoTrack
import java.util.UUID

private object Colors {
    val background = Color(0xFF071C16)
    val panel = Color(0xFF102B23)
    val panelSoft = Color(0xFF17382F)
    val green = Color(0xFF25D366)
    val text = Color(0xFFF2FFF8)
    val muted = Color(0xFF9DB8AD)
    val danger = Color(0xFFE64B57)
}

private sealed interface CallIntent {
    data class Create(
        val targetUserId: String,
        val callType: String,
        val requestId: String = UUID.randomUUID().toString(),
    ) : CallIntent
    data class Accept(val session: CallSession) : CallIntent
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(Modifier.fillMaxSize(), color = Colors.background) { FamiliarProtocolApp() }
            }
        }
    }
}

@Composable
private fun FamiliarProtocolApp() {
    val api = remember { BackendApi(BuildConfig.CALL_BACKEND_BASE_URL) }
    val scope = rememberCoroutineScope()
    var identity by remember { mutableStateOf<Identity?>(null) }
    var sessions by remember { mutableStateOf(emptyList<CallSession>()) }
    var callIntent by remember { mutableStateOf<CallIntent?>(null) }
    var notice by remember { mutableStateOf("") }

    LaunchedEffect(identity?.userId, callIntent == null) {
        val user = identity ?: return@LaunchedEffect
        while (isActive) {
            runCatching { api.sessions(user.userId) }
                .onSuccess { sessions = it }
                .onFailure { notice = it.message ?: "The call backend is unavailable." }
            delay(1_000)
        }
    }

    when (val user = identity) {
        null -> IdentityScreen(notice) { identity = it; notice = "" }
        else -> when (val intent = callIntent) {
            null -> HomeScreen(
                identity = user,
                sessions = sessions,
                notice = notice,
                onCall = { target, type -> callIntent = CallIntent.Create(target, type); notice = "" },
                onAccept = { callIntent = CallIntent.Accept(it); notice = "" },
                onDecline = { session -> scope.launch { runCatching { api.endCall(session.id, user.userId, "declined") } } },
                onReset = { identity = null; sessions = emptyList() },
            )
            else -> ProtocolCallScreen(
                identity = user,
                intent = intent,
                api = api,
                onError = { notice = it },
                onFinished = { callIntent = null },
            )
        }
    }
}

@Composable
private fun IdentityScreen(notice: String, onContinue: (Identity) -> Unit) {
    var name by remember { mutableStateOf("") }
    var userId by remember { mutableStateOf("") }
    val valid = name.length in 2..10 && userId.matches(Regex("[A-Za-z][A-Za-z0-9_-]{1,63}"))
    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Card(colors = CardDefaults.cardColors(Colors.panel), shape = RoundedCornerShape(28.dp)) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Avatar("MS", 64)
                Text("Familiar calls", color = Colors.text, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text("Call people directly. Rooms and protocol resources stay behind your backend.", color = Colors.muted)
                OutlinedTextField(name, { name = it.filter(Char::isLetterOrDigit).take(10) }, label = { Text("Display name") })
                OutlinedTextField(userId, { userId = it.filter { c -> c.isLetterOrDigit() || c in "_-" }.take(64) }, label = { Text("User ID") })
                if (notice.isNotBlank()) Text(notice, color = Colors.danger)
                Button(
                    enabled = valid,
                    onClick = { onContinue(Identity(name, userId)) },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(Colors.green, Color(0xFF002F1D)),
                ) { Text("Continue", fontWeight = FontWeight.Bold) }
                Text("Demo identity only—use authenticated backend identity in production.", color = Colors.muted, fontSize = 12.sp)
            }
        }
    }
}

@Composable
private fun HomeScreen(
    identity: Identity,
    sessions: List<CallSession>,
    notice: String,
    onCall: (String, String) -> Unit,
    onAccept: (CallSession) -> Unit,
    onDecline: (CallSession) -> Unit,
    onReset: () -> Unit,
) {
    var target by remember { mutableStateOf("") }
    var video by remember { mutableStateOf(true) }
    val incoming = sessions.filter { it.targetUserId == identity.userId && it.status == "ringing" }
    Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Avatar(identity.displayName, 50)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(identity.displayName, color = Colors.text, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                Text("WHIP publish · WHEP playback", color = Colors.muted)
            }
            OutlinedButton(onClick = onReset) { Text("Change") }
        }
        Card(colors = CardDefaults.cardColors(Colors.panel), shape = RoundedCornerShape(24.dp)) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Start a private call", color = Colors.text, fontWeight = FontWeight.Bold)
                OutlinedTextField(target, { target = it.filter { c -> c.isLetterOrDigit() || c in "_-" }.take(64) }, label = { Text("Person's user ID") })
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = { video = false }, enabled = video) { Text("Audio") }
                    OutlinedButton(onClick = { video = true }, enabled = !video) { Text("Video") }
                }
                Button(
                    onClick = { onCall(target, if (video) "video" else "audio") },
                    enabled = target.isNotBlank() && target != identity.userId,
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.buttonColors(Colors.green, Color(0xFF002F1D)),
                ) { Text("Call person") }
            }
        }
        if (notice.isNotBlank()) Text(notice, color = Colors.danger)
        Text("Incoming", color = Colors.text, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            if (incoming.isEmpty()) item { Text("No incoming calls", color = Colors.muted) }
            items(incoming, key = { it.id }) { session ->
                Card(colors = CardDefaults.cardColors(Colors.panelSoft)) {
                    Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Avatar(session.displayName, 44)
                        Spacer(Modifier.width(10.dp))
                        Column(Modifier.weight(1f)) {
                            Text(session.displayName, color = Colors.text, fontWeight = FontWeight.Bold)
                            Text("${session.callType.replaceFirstChar { it.uppercase() }} call", color = Colors.muted)
                        }
                        OutlinedButton(onClick = { onDecline(session) }) { Text("Decline") }
                        Spacer(Modifier.width(6.dp))
                        Button(onClick = { onAccept(session) }, colors = ButtonDefaults.buttonColors(Colors.green)) { Text("Accept") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ProtocolCallScreen(identity: Identity, intent: CallIntent, api: BackendApi, onError: (String) -> Unit, onFinished: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val engine = remember { WhipWhepEngine(context) }
    var session by remember { mutableStateOf((intent as? CallIntent.Accept)?.session) }
    var local by remember { mutableStateOf<LocalMedia?>(null) }
    var screen by remember { mutableStateOf<ScreenMedia?>(null) }
    var remote by remember { mutableStateOf(RemoteMedia(null, null)) }
    var remoteScreenActive by remember { mutableStateOf(false) }
    var publisher by remember { mutableStateOf<ProtocolResource?>(null) }
    var playback by remember { mutableStateOf<ProtocolResource?>(null) }
    var phase by remember { mutableStateOf("Securing call…") }
    var granted by remember { mutableStateOf(false) }
    var requestStarted by remember { mutableStateOf(false) }
    var ending by remember { mutableStateOf(false) }
    var screenBusy by remember { mutableStateOf(false) }

    val callType = when (intent) {
        is CallIntent.Create -> intent.callType
        is CallIntent.Accept -> intent.session.callType
    }
    val required = if (callType == "video") arrayOf(Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA)
    else arrayOf(Manifest.permission.RECORD_AUDIO)
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        granted = required.all { result[it] == true || ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
        if (!granted) onError("Microphone${if (callType == "video") " and camera" else ""} permission is required.")
    }

    suspend fun replacePublishedVideo(videoTrack: VideoTrack, screenActive: Boolean) {
        val active = session ?: throw IllegalStateException("The call is not ready for screen sharing.")
        val resource = publisher ?: throw IllegalStateException("Local publishing is not ready.")
        check(resource.replaceVideoTrack(videoTrack)) { "The active WHIP sender could not replace its video track." }
        api.updatePresentation(active.id, identity.userId, screenActive)
    }

    suspend fun stopScreenShare() {
        if (screenBusy) return
        val activeScreen = screen ?: return
        screenBusy = true
        phase = "Returning to camera…"
        val camera = local?.videoTrack
        if (camera == null) {
            screenBusy = false
            onError("Camera media is not available to resume.")
            return
        }
        runCatching { replacePublishedVideo(camera, screenActive = false) }
            .onSuccess {
                screen = null
                engine.releaseScreen(activeScreen)
                ScreenCaptureForegroundService.stop(context)
                phase = "Live"
            }
            .onFailure { onError(it.message ?: "Could not return to camera media.") }
        screenBusy = false
    }

    val screenLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            screenBusy = false
            onError("Screen sharing was cancelled.")
        } else {
            scope.launch {
                var candidate: ScreenMedia? = null
                runCatching {
                    screenBusy = true
                    phase = "Starting screen share…"
                    ScreenCaptureForegroundService.start(context)
                    candidate = engine.captureScreen(result.data!!) {
                        scope.launch { stopScreenShare() }
                    }
                    replacePublishedVideo(candidate!!.videoTrack, screenActive = true)
                    screen = candidate
                    phase = "Live · Sharing screen"
                }.onFailure { error ->
                    engine.releaseScreen(candidate)
                    ScreenCaptureForegroundService.stop(context)
                    phase = "Live"
                    onError(error.message ?: "Could not start screen sharing.")
                }
                screenBusy = false
            }
        }
    }

    LaunchedEffect(Unit) {
        granted = required.all { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }
        if (!granted && !requestStarted) { requestStarted = true; permissionLauncher.launch(required) }
    }

    suspend fun stopCall(reason: String) {
        if (ending) return
        ending = true
        runCatching { playback?.stop() }
        runCatching { publisher?.stop() }
        engine.releaseScreen(screen)
        screen = null
        ScreenCaptureForegroundService.stop(context)
        engine.releaseLocal(local)
        local = null
        session?.let { runCatching { api.endCall(it.id, identity.userId, reason) } }
        onFinished()
    }

    LaunchedEffect(granted) {
        if (!granted) return@LaunchedEffect
        try {
            val active = when (intent) {
                is CallIntent.Create -> api.createCall(identity, intent.targetUserId, intent.callType, intent.requestId)
                is CallIntent.Accept -> api.acceptCall(identity, intent.session)
            }.also { session = it }
            phase = if (active.status == "ringing") "Ringing…" else "Connecting media…"
            val captured = engine.capture(active.callType == "video").also { local = it }
            val publishLease = api.preparePublisher(identity, active.id)
            publisher = engine.publish(publishLease, captured)
            phase = "Waiting for peer media…"
            while (isActive) {
                val peer = api.preparePeer(identity, active.id)
                remoteScreenActive = peer.screenActive
                if (peer.ready && peer.playback != null) {
                    if (playback == null) {
                        playback = engine.consume(peer.playback) { incoming ->
                            remote = incoming
                            // Remote AudioTrack remains enabled independently of video rendering.
                            incoming.audioTrack?.setEnabled(true)
                        }
                    }
                    phase = "Live"
                } else {
                    phase = if (peer.reason == "peer_media_not_active") "Peer is connecting media…" else "Waiting for answer…"
                    delay(1_000)
                }
                if (peer.ready) delay(1_000)
            }
        } catch (error: Throwable) {
            phase = "Connection issue"
            onError(error.message ?: "Could not establish the WHIP/WHEP call.")
        }
    }

    DisposableEffect(Unit) {
        onDispose {
            ScreenCaptureForegroundService.stop(context)
            engine.releaseScreen(screen)
            engine.releaseLocal(local)
            engine.dispose()
        }
    }
    BackHandler { scope.launch { stopCall("user_ended") } }

    val peerName = session?.let { if (it.hostUserId == identity.userId) it.targetUserId else it.displayName } ?: "Caller"
    CallSurface(
        peerName = peerName,
        phase = phase,
        local = local,
        screen = screen,
        remoteScreenActive = remoteScreenActive,
        remote = remote,
        eglContext = engine.eglBase.eglBaseContext,
        screenBusy = screenBusy,
        onToggleScreen = {
            if (screen != null) {
                scope.launch { stopScreenShare() }
            } else if (!screenBusy) {
                screenBusy = true
                screenLauncher.launch(
                    (context.getSystemService(android.content.Context.MEDIA_PROJECTION_SERVICE)
                        as android.media.projection.MediaProjectionManager).createScreenCaptureIntent(),
                )
            }
        },
        onEnd = { scope.launch { stopCall("user_ended") } },
    )
}

@Composable
private fun CallSurface(
    peerName: String,
    phase: String,
    local: LocalMedia?,
    screen: ScreenMedia?,
    remoteScreenActive: Boolean,
    remote: RemoteMedia,
    eglContext: EglBase.Context,
    screenBusy: Boolean,
    onToggleScreen: () -> Unit,
    onEnd: () -> Unit,
) {
    var remotePrimary by remember { mutableStateOf(true) }
    var muted by remember { mutableStateOf(false) }
    var cameraOff by remember { mutableStateOf(false) }
    var miniOffset by remember { mutableStateOf(MiniOffset(0f, 0f)) }
    var stageSize by remember { mutableStateOf(IntSize.Zero) }
    val miniSize = IntSize(360, 520)
    val presentation = resolvePresentation(
        screen = if (remoteScreenActive) remote.videoTrack else screen?.videoTrack,
        remote = if (remoteScreenActive) null else remote.videoTrack,
        local = local?.videoTrack,
        remotePrimary = remotePrimary,
    )
    val swap = { if (!presentation.screenActive && presentation.mini != null) remotePrimary = !remotePrimary }

    Column(Modifier.fillMaxSize().background(Colors.background)) {
        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Avatar(peerName, 48)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(peerName, color = Colors.text, fontSize = 21.sp, fontWeight = FontWeight.Bold)
                Text(phase, color = Colors.muted)
            }
            Text("WHIP · WHEP", color = Colors.green, fontWeight = FontWeight.Bold)
        }
        Box(
            Modifier.weight(1f).fillMaxWidth().background(Color.Black).onSizeChanged { stageSize = it },
            contentAlignment = Alignment.Center,
        ) {
            presentation.primary?.let { surface ->
                VideoRenderer(
                    surface.track,
                    eglContext,
                    surface.kind == SurfaceKind.LOCAL,
                    Modifier.fillMaxSize(),
                    onDoubleTap = if (presentation.screenActive) null else swap,
                )
                SurfaceLabel(surface.label, Modifier.align(Alignment.BottomStart).padding(14.dp))
            } ?: Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Avatar(peerName, 88)
                Spacer(Modifier.height(12.dp))
                Text("Preparing private media", color = Colors.text, fontWeight = FontWeight.Bold)
                Text("Direct WebRTC; no MediaSFU client SDK", color = Colors.muted)
            }
            presentation.mini?.let { surface ->
                val bounded = clampMiniOffset(miniOffset, stageSize.width.toFloat(), stageSize.height.toFloat(), miniSize.width.toFloat(), miniSize.height.toFloat(), 14f)
                Box(
                    Modifier
                        .align(Alignment.TopEnd)
                        .padding(14.dp)
                        .size(120.dp, 174.dp)
                        .offset { IntOffset(bounded.x.roundToInt(), bounded.y.roundToInt()) }
                        .background(Colors.panelSoft, RoundedCornerShape(18.dp)),
                ) {
                    VideoRenderer(
                        surface.track,
                        eglContext,
                        surface.kind == SurfaceKind.LOCAL,
                        Modifier.fillMaxSize(),
                        onDoubleTap = swap,
                        onDrag = { drag ->
                            miniOffset = clampMiniOffset(
                                MiniOffset(miniOffset.x + drag.x, miniOffset.y + drag.y),
                                stageSize.width.toFloat(), stageSize.height.toFloat(), miniSize.width.toFloat(), miniSize.height.toFloat(), 14f,
                            )
                        },
                    )
                    SurfaceLabel(surface.label, Modifier.align(Alignment.BottomStart).padding(8.dp))
                }
            }
        }
        if (presentation.mini != null) Text(
            if (presentation.screenActive) "Screen share stays primary · Drag the small view" else "Double-tap to swap · Drag the small view",
            color = Colors.muted, fontSize = 12.sp, modifier = Modifier.fillMaxWidth().padding(top = 8.dp), textAlign = TextAlign.Center,
        )
        Row(Modifier.fillMaxWidth().padding(16.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
            FilledIconButton(
                onClick = { muted = !muted; local?.audioTrack?.setEnabled(!muted) },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Colors.panelSoft),
                modifier = Modifier.size(58.dp),
            ) { Text(if (muted) "Mic" else "Mute", color = Colors.text, fontSize = 11.sp) }
            if (local?.videoTrack != null) FilledIconButton(
                onClick = { cameraOff = !cameraOff; local.videoTrack.setEnabled(!cameraOff) },
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Colors.panelSoft),
                modifier = Modifier.size(58.dp),
            ) { Text(if (cameraOff) "Video" else "Camera", color = Colors.text, fontSize = 10.sp) }
            if (local?.videoTrack != null) FilledIconButton(
                onClick = onToggleScreen,
                enabled = !screenBusy,
                colors = IconButtonDefaults.filledIconButtonColors(
                    containerColor = if (screen != null) Colors.green else Colors.panelSoft,
                ),
                modifier = Modifier.size(58.dp),
            ) { Text(if (screenBusy) "Wait" else if (screen != null) "Stop" else "Share", color = Colors.text, fontSize = 10.sp) }
            FilledIconButton(
                onClick = onEnd,
                colors = IconButtonDefaults.filledIconButtonColors(containerColor = Colors.danger),
                modifier = Modifier.size(58.dp),
            ) { Text("End", color = Color.White, fontSize = 12.sp) }
        }
    }
}

@Composable
private fun VideoRenderer(
    track: VideoTrack,
    eglContext: EglBase.Context,
    mirror: Boolean,
    modifier: Modifier,
    onDoubleTap: (() -> Unit)? = null,
    onDrag: ((Offset) -> Unit)? = null,
) {
    var renderer by remember(track) { mutableStateOf<SurfaceViewRenderer?>(null) }
    val currentDoubleTap = rememberUpdatedState(onDoubleTap)
    val currentDrag = rememberUpdatedState(onDrag)
    AndroidView(
        modifier = modifier,
        factory = { context -> SurfaceViewRenderer(context).also { view ->
            view.init(eglContext, null)
            view.setEnableHardwareScaler(true)
            view.setMirror(mirror)
            track.addSink(view)
            val detector = GestureDetector(context, object : GestureDetector.SimpleOnGestureListener() {
                override fun onDown(event: MotionEvent): Boolean = true
                override fun onDoubleTap(event: MotionEvent): Boolean {
                    currentDoubleTap.value?.invoke()
                    return currentDoubleTap.value != null
                }
                override fun onScroll(
                    first: MotionEvent?,
                    current: MotionEvent,
                    distanceX: Float,
                    distanceY: Float,
                ): Boolean {
                    currentDrag.value?.invoke(Offset(-distanceX, -distanceY))
                    return currentDrag.value != null
                }
            })
            view.setOnTouchListener { _, event -> detector.onTouchEvent(event) }
            renderer = view
        } },
        update = { it.setMirror(mirror) },
    )
    DisposableEffect(track, renderer) {
        onDispose { renderer?.let { view -> track.removeSink(view); view.release() } }
    }
}

@Composable
private fun Avatar(value: String, size: Int) {
    val initials = value.trim().split(Regex("\\s+")).filter(String::isNotBlank).take(2).joinToString("") { it.first().uppercase() }.ifBlank { "?" }
    Box(Modifier.size(size.dp).background(Colors.green, CircleShape), contentAlignment = Alignment.Center) {
        Text(initials, color = Color(0xFF002F1D), fontWeight = FontWeight.Bold, fontSize = (size / 3).sp)
    }
}

@Composable
private fun SurfaceLabel(value: String, modifier: Modifier) {
    Text(value, color = Color.White, fontSize = 12.sp, modifier = modifier.background(Color(0xAA071C16), RoundedCornerShape(12.dp)).padding(horizontal = 9.dp, vertical = 5.dp))
}
