package com.mediasfu.familiarcall

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CallEnd
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.MicOff
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ScreenShare
import androidx.compose.material.icons.filled.StopScreenShare
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.VideocamOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.mediasfu.sdk.MediaSfuEngine
import com.mediasfu.sdk.methods.MediasfuParameters
import com.mediasfu.sdk.methods.utils.CreateJoinRoomError
import com.mediasfu.sdk.methods.utils.CreateJoinRoomResult
import com.mediasfu.sdk.model.Stream
import com.mediasfu.sdk.ui.components.display.CardVideoDisplayOptions
import com.mediasfu.sdk.ui.components.display.DefaultCardVideoDisplay
import com.mediasfu.sdk.ui.components.display.renderCompose
import com.mediasfu.sdk.ui.mediasfu.MediasfuGeneric
import com.mediasfu.sdk.ui.mediasfu.MediasfuGenericOptions
import com.mediasfu.sdk.ui.mediasfu.MediasfuGenericState
import com.mediasfu.sdk.webrtc.WebRtcFactory
import com.mediasfu.sdk.webrtc.ScreenCaptureHelper
import kotlin.math.roundToInt
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class Identity(val displayName: String, val userId: String)

private sealed interface CallMode {
    val callType: String

    data class Create(
        val targetUserId: String,
        override val callType: String,
    ) : CallMode

    data class Join(val session: CallSession) : CallMode {
        override val callType: String = session.callType
    }
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = AppColors.background) {
                    FamiliarCallApp()
                }
            }
        }
    }
}

private object AppColors {
    val background = Color(0xFF071C16)
    val panel = Color(0xFF102B23)
    val panelSoft = Color(0xFF17382F)
    val green = Color(0xFF25D366)
    val greenDark = Color(0xFF0C6B42)
    val text = Color(0xFFF2FFF8)
    val muted = Color(0xFF9DB8AD)
    val danger = Color(0xFFE64B57)
}

@Composable
private fun FamiliarCallApp() {
    val api = remember { BackendApi(BuildConfig.CALL_BACKEND_BASE_URL) }
    val scope = rememberCoroutineScope()
    var identity by remember { mutableStateOf<Identity?>(null) }
    var sessions by remember { mutableStateOf(emptyList<CallSession>()) }
    var callMode by remember { mutableStateOf<CallMode?>(null) }
    var activeSession by remember { mutableStateOf<CallSession?>(null) }
    var notice by remember { mutableStateOf("") }

    LaunchedEffect(identity?.userId) {
        val current = identity ?: return@LaunchedEffect
        while (isActive) {
            runCatching { api.sessions(current.userId) }
                .onSuccess { latest ->
                    sessions = latest
                    activeSession = activeSession?.let { active ->
                        latest.firstOrNull { it.id == active.id } ?: active
                    }
                }
                .onFailure { notice = it.message ?: "The call backend is unavailable." }
            delay(1_000)
        }
    }

    val currentIdentity = identity
    when {
        currentIdentity == null -> OnboardingScreen(
            notice = notice,
            onContinue = { next -> identity = next; notice = "" },
        )
        callMode == null -> HomeScreen(
            identity = currentIdentity,
            sessions = sessions,
            notice = notice,
            onStart = { target, type ->
                notice = ""
                activeSession = null
                callMode = CallMode.Create(target, type)
            },
            onAccept = { session ->
                notice = ""
                activeSession = session
                callMode = CallMode.Join(session)
            },
            onDecline = { session ->
                scope.launch {
                    runCatching { api.endCall(session.id, currentIdentity.userId, "declined") }
                        .onFailure { notice = it.message ?: "Could not decline the call." }
                }
            },
            onReset = {
                identity = null
                sessions = emptyList()
                notice = ""
            },
        )
        else -> CallEngine(
            identity = currentIdentity,
            mode = callMode!!,
            activeSession = activeSession,
            api = api,
            notice = notice,
            onProvisioned = { provision ->
                activeSession = provision.session
                sessions = listOf(provision.session) + sessions.filterNot { it.id == provision.session.id }
            },
            onError = { notice = it },
            onFinished = {
                callMode = null
                activeSession = null
            },
        )
    }
}

@Composable
private fun OnboardingScreen(notice: String, onContinue: (Identity) -> Unit) {
    var displayName by remember { mutableStateOf("") }
    var userId by remember { mutableStateOf("") }
    val valid = displayName.length in 2..10 && userId.matches(Regex("[A-Za-z][A-Za-z0-9_-]{1,63}"))

    Box(modifier = Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
        Card(
            colors = CardDefaults.cardColors(containerColor = AppColors.panel),
            shape = RoundedCornerShape(28.dp),
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                Avatar("MS", 64)
                Text("Familiar calls", color = AppColors.text, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text(
                    "Choose a local example identity. Your backend creates rooms invisibly—people call people, never meeting IDs.",
                    color = AppColors.muted,
                )
                OutlinedTextField(
                    value = displayName,
                    onValueChange = { displayName = it.filter(Char::isLetterOrDigit).take(10) },
                    label = { Text("Display name") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = userId,
                    onValueChange = { userId = it.filter { char -> char.isLetterOrDigit() || char == '_' || char == '-' }.take(64) },
                    label = { Text("User ID") },
                    singleLine = true,
                )
                if (notice.isNotBlank()) Text(notice, color = AppColors.danger)
                Button(
                    enabled = valid,
                    onClick = { onContinue(Identity(displayName, userId)) },
                    colors = ButtonDefaults.buttonColors(containerColor = AppColors.green, contentColor = Color(0xFF002F1D)),
                    modifier = Modifier.fillMaxWidth(),
                ) { Text("Continue", fontWeight = FontWeight.Bold) }
                Text(
                    "Replace this demo identity with your authenticated app user before production.",
                    color = AppColors.muted,
                    fontSize = 12.sp,
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(
    identity: Identity,
    sessions: List<CallSession>,
    notice: String,
    onStart: (String, String) -> Unit,
    onAccept: (CallSession) -> Unit,
    onDecline: (CallSession) -> Unit,
    onReset: () -> Unit,
) {
    var target by remember { mutableStateOf("") }
    var callType by remember { mutableStateOf("video") }
    val incoming = sessions.firstOrNull { it.targetUserId == identity.userId && it.status == "ringing" }

    Scaffold(
        containerColor = AppColors.background,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Chats & calls", color = AppColors.text, fontWeight = FontWeight.Bold)
                        Text("Ready · MediaSFU Kotlin SDK", color = AppColors.muted, fontSize = 12.sp)
                    }
                },
                actions = {
                    OutlinedButton(onClick = onReset, modifier = Modifier.padding(end = 12.dp)) {
                        Text("${identity.displayName} · @${identity.userId}")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AppColors.panel),
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (incoming != null) {
                item {
                    Card(colors = CardDefaults.cardColors(containerColor = AppColors.greenDark)) {
                        Column(modifier = Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Incoming ${incoming.callType} call", color = AppColors.muted)
                            Text(incoming.displayName.ifBlank { incoming.hostUserId }, color = AppColors.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                            Text("@${incoming.hostUserId} is calling", color = AppColors.muted)
                            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                                OutlinedButton(onClick = { onDecline(incoming) }) { Text("Decline") }
                                Button(
                                    onClick = { onAccept(incoming) },
                                    colors = ButtonDefaults.buttonColors(containerColor = AppColors.green, contentColor = Color(0xFF002F1D)),
                                ) { Text("Accept call") }
                            }
                        }
                    }
                }
            }
            item {
                Card(colors = CardDefaults.cardColors(containerColor = AppColors.panel)) {
                    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        Text("Start a call", color = AppColors.text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                        Text("Invite someone by their app user ID", color = AppColors.muted)
                        OutlinedTextField(
                            value = target,
                            onValueChange = { target = it.filter { char -> char.isLetterOrDigit() || char == '_' || char == '-' }.take(64) },
                            label = { Text("Who would you like to call?") },
                            placeholder = { Text("friend-user-id") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            FilterChip(
                                selected = callType == "video",
                                onClick = { callType = "video" },
                                label = { Text("Video") },
                                leadingIcon = { Icon(Icons.Filled.Videocam, null) },
                            )
                            FilterChip(
                                selected = callType == "audio",
                                onClick = { callType = "audio" },
                                label = { Text("Audio") },
                                leadingIcon = { Icon(Icons.Filled.Mic, null) },
                            )
                        }
                        Button(
                            enabled = target.length >= 2 && target != identity.userId,
                            onClick = { onStart(target, callType) },
                            colors = ButtonDefaults.buttonColors(containerColor = AppColors.green, contentColor = Color(0xFF002F1D)),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Filled.Call, null)
                            Spacer(Modifier.width(8.dp))
                            Text("Call now", fontWeight = FontWeight.Bold)
                        }
                        if (notice.isNotBlank()) Text(notice, color = AppColors.danger)
                    }
                }
            }
            item { Text("Recent calls", color = AppColors.text, fontSize = 20.sp, fontWeight = FontWeight.Bold) }
            if (sessions.isEmpty()) {
                item { Text("Your call history will appear here.", color = AppColors.muted) }
            } else {
                items(sessions, key = { it.id }) { session ->
                    val peer = if (session.hostUserId == identity.userId) session.targetUserId else session.hostUserId
                    Card(colors = CardDefaults.cardColors(containerColor = AppColors.panelSoft)) {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(14.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Avatar(peer.take(2).uppercase(), 42)
                            Spacer(Modifier.width(12.dp))
                            Column(Modifier.weight(1f)) {
                                Text(peer, color = AppColors.text, fontWeight = FontWeight.SemiBold)
                                Text("${session.callType.replaceFirstChar(Char::uppercase)} · ${session.status.replaceFirstChar(Char::uppercase)}", color = AppColors.muted)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CallEngine(
    identity: Identity,
    mode: CallMode,
    activeSession: CallSession?,
    api: BackendApi,
    notice: String,
    onProvisioned: (RoomProvision) -> Unit,
    onError: (String) -> Unit,
    onFinished: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val engine = remember {
        MediaSfuEngine(deviceProvider = { runCatching { WebRtcFactory.createDevice(context) }.getOrNull() })
    }
    val parameters = remember(engine) { engine.getParameters() }
    var pendingAudioPermission by remember { mutableStateOf<CompletableDeferred<Boolean>?>(null) }
    var pendingCameraPermission by remember { mutableStateOf<CompletableDeferred<Boolean>?>(null) }
    var pendingScreenPermission by remember { mutableStateOf<CompletableDeferred<Map<String, Any?>?>?>(null) }

    val audioLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        parameters.hasAudioPermission = granted
        pendingAudioPermission?.complete(granted)
        pendingAudioPermission = null
    }
    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        parameters.hasCameraPermission = granted
        pendingCameraPermission?.complete(granted)
        pendingCameraPermission = null
    }
    val screenLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val pending = pendingScreenPermission
        pendingScreenPermission = null
        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            pending?.complete(null)
        } else {
            scope.launch {
                runCatching {
                    ScreenCaptureForegroundService.start(context)
                    mapOf(
                        "resultCode" to result.resultCode,
                        "data" to result.data,
                        "onProjectionStopped" to { ScreenCaptureForegroundService.stop(context) },
                    )
                }.onSuccess { pending?.complete(it) }
                    .onFailure {
                        ScreenCaptureForegroundService.stop(context)
                        pending?.complete(null)
                        onError("Android could not start screen capture.")
                    }
            }
        }
    }

    LaunchedEffect(engine) {
        engine.initializeDevice(context)
        parameters.hasAudioPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        parameters.hasCameraPermission = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        parameters.requestPermissionAudio = suspend {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                parameters.hasAudioPermission = true
                true
            } else {
                CompletableDeferred<Boolean>().also { deferred ->
                    pendingAudioPermission?.cancel()
                    pendingAudioPermission = deferred
                    audioLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }.await()
            }
        }
        parameters.requestPermissionCamera = suspend {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                parameters.hasCameraPermission = true
                true
            } else {
                CompletableDeferred<Boolean>().also { deferred ->
                    pendingCameraPermission?.cancel()
                    pendingCameraPermission = deferred
                    cameraLauncher.launch(Manifest.permission.CAMERA)
                }.await()
            }
        }
        parameters.requestScreenCapturePermission = suspend {
            CompletableDeferred<Map<String, Any?>?>().also { deferred ->
                pendingScreenPermission?.cancel()
                pendingScreenPermission = deferred
                screenLauncher.launch(ScreenCaptureHelper.createPermissionIntent(context))
            }.await()
        }
        parameters.stopScreenCaptureService = {
            ScreenCaptureForegroundService.stop(context)
        }
    }

    DisposableEffect(engine) {
        onDispose {
            pendingAudioPermission?.cancel()
            pendingCameraPermission?.cancel()
            pendingScreenPermission?.cancel()
            parameters.requestPermissionAudio = null
            parameters.requestPermissionCamera = null
            parameters.requestScreenCapturePermission = null
            parameters.stopScreenCaptureService = null
            ScreenCaptureForegroundService.stop(context)
        }
    }

    val peer = when (mode) {
        is CallMode.Create -> mode.targetUserId
        is CallMode.Join -> mode.session.hostUserId
    }
    val createOptions = (mode as? CallMode.Create)?.let {
        mapOf(
            "action" to "create",
            "userName" to identity.displayName,
            "duration" to 30,
            "capacity" to 2,
            "eventType" to "conference",
        )
    }
    val joinOptions = (mode as? CallMode.Join)?.let {
        mapOf(
            "action" to "join",
            "userName" to identity.displayName,
            "meetingID" to it.session.meetingId,
        )
    }

    val options = remember(mode, identity.userId) {
        MediasfuGenericOptions(
            connectMediaSFU = true,
            returnUI = false,
            sourceParameters = parameters,
            updateSourceParameters = { /* The SDK mutates this shared, current parameter object. */ },
            noUIPreJoinOptionsCreate = createOptions,
            noUIPreJoinOptionsJoin = joinOptions,
            createMediaSFURoom = {
                try {
                    val provision = api.createCall(identity, (mode as CallMode.Create).targetUserId, mode.callType)
                    onProvisioned(provision)
                    provision.roomResult
                } catch (error: Throwable) {
                    val message = error.message ?: "Could not create the call."
                    onError(message)
                    CreateJoinRoomResult(CreateJoinRoomError(message, false), false)
                }
            },
            joinMediaSFURoom = {
                try {
                    val provision = api.joinCall(identity, (mode as CallMode.Join).session)
                    onProvisioned(provision)
                    provision.roomResult
                } catch (error: Throwable) {
                    val message = error.message ?: "Could not join the call."
                    onError(message)
                    CreateJoinRoomResult(CreateJoinRoomError(message, false), false)
                }
            },
            customComponent = { state ->
                FamiliarCallSurface(
                    state = state,
                    parameters = parameters,
                    identity = identity,
                    peer = peer,
                    callType = mode.callType,
                    activeSession = activeSession,
                    api = api,
                    notice = notice,
                    onError = onError,
                    onFinished = onFinished,
                )
            },
        )
    }

    Box(modifier = Modifier.fillMaxSize().background(AppColors.background)) {
        ConnectingSurface(peer = peer, callType = mode.callType, notice = notice)
        MediasfuGeneric(options = options, modifier = Modifier.fillMaxSize())
    }
}

@Composable
private fun FamiliarCallSurface(
    state: MediasfuGenericState,
    parameters: MediasfuParameters,
    identity: Identity,
    peer: String,
    callType: String,
    activeSession: CallSession?,
    api: BackendApi,
    notice: String,
    onError: (String) -> Unit,
    onFinished: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var mediaStarted by remember { mutableStateOf(false) }
    var focusedProducerId by remember { mutableStateOf<String?>(null) }
    var stageSize by remember { mutableStateOf(IntSize.Zero) }
    var miniSize by remember { mutableStateOf(IntSize.Zero) }
    var miniOffset by remember { mutableStateOf(Offset.Zero) }

    LaunchedEffect(parameters.validated, callType) {
        if (parameters.validated && !mediaStarted) {
            mediaStarted = true
            if (!parameters.audioAlreadyOn) state.toggleAudio()
            if (callType == "video" && !parameters.videoAlreadyOn) {
                delay(300)
                state.toggleVideo()
            }
        }
    }

    // Android WebRTC plays enabled remote audio tracks through the native audio
    // device. Keep every prepared SDK audio stream active independently of the
    // selected video surface.
    val audioStreams = parameters.allAudioStreams
    LaunchedEffect(audioStreams.map(Stream::producerId)) {
        audioStreams.forEach { stream ->
            stream.stream?.getAudioTracks()?.forEach { track -> track.setEnabled(true) }
        }
    }

    val base = resolveMediaPresentation(
        streams = parameters.allVideoStreamsState,
        localStream = parameters.localStreamVideo,
        screenProducerId = parameters.screenShareIDStream,
        screenParticipantName = parameters.screenShareNameStream,
        peerLabel = peer,
    )
    val cameras = (listOfNotNull(base.primary) + base.previews).filterNot(MediaSurface::isScreen)
    val primary = if (base.screenActive) {
        base.primary
    } else {
        cameras.firstOrNull { it.source.producerId == focusedProducerId }
            ?: base.primary
            ?: cameras.firstOrNull()
    }
    val previews = if (base.screenActive) {
        base.previews
    } else {
        cameras.filterNot { it.source.producerId == primary?.source?.producerId }
    }

    fun swapFocus() {
        if (base.screenActive || previews.isEmpty()) return
        focusedProducerId = previews.first().source.producerId
    }

    fun clampMiniOffset(candidate: Offset): Offset {
        val horizontal = (stageSize.width - miniSize.width).coerceAtLeast(0).toFloat()
        val vertical = (stageSize.height - miniSize.height).coerceAtLeast(0).toFloat()
        return Offset(candidate.x.coerceIn(-horizontal, 0f), candidate.y.coerceIn(0f, vertical))
    }

    fun finish() {
        state.exitSession()
        scope.launch {
            activeSession?.let { session ->
                runCatching { api.endCall(session.id, identity.userId) }
                    .onFailure { onError(it.message ?: "Could not close the call session.") }
            }
            onFinished()
        }
    }

    BackHandler { finish() }

    Column(modifier = Modifier.fillMaxSize().background(AppColors.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().background(AppColors.panel).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(peer.take(2).uppercase(), 46)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(peer, color = AppColors.text, fontWeight = FontWeight.Bold)
                Text("${callType.replaceFirstChar(Char::uppercase)} call · Live", color = AppColors.muted)
            }
            Text("● LIVE", color = AppColors.green, fontWeight = FontWeight.Bold)
        }

        Box(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(12.dp).onSizeChanged { stageSize = it },
        ) {
            if (primary == null) {
                Box(
                    modifier = Modifier.fillMaxSize().background(AppColors.panel, RoundedCornerShape(24.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Avatar(peer.take(2).uppercase(), 86)
                        Spacer(Modifier.height(14.dp))
                        Text("Preparing peer media…", color = AppColors.text, fontWeight = FontWeight.Bold)
                    }
                }
            } else {
                VideoSurface(
                    surface = primary,
                    modifier = Modifier.fillMaxSize().pointerInput(primary.source.producerId, base.screenActive) {
                        detectTapGestures(onDoubleTap = { swapFocus() })
                    },
                )
            }

            if (previews.isNotEmpty()) {
                Box(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .offset { IntOffset(miniOffset.x.roundToInt(), miniOffset.y.roundToInt()) }
                        .width(168.dp)
                        .aspectRatio(16f / 10f)
                        .onSizeChanged { miniSize = it; miniOffset = clampMiniOffset(miniOffset) }
                        .pointerInput(stageSize, miniSize) {
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                miniOffset = clampMiniOffset(miniOffset + dragAmount)
                            }
                        },
                ) {
                    VideoSurface(
                        surface = previews.first(),
                        modifier = Modifier.fillMaxSize().pointerInput(previews.first().source.producerId, base.screenActive) {
                            detectTapGestures(onDoubleTap = { swapFocus() })
                        },
                    )
                }
            }
        }

        if (previews.isNotEmpty()) {
            Text(
                "Double-tap to swap views · Drag the small view to move it",
                color = AppColors.muted,
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (notice.isNotBlank()) {
            Text(notice, color = AppColors.danger, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(6.dp))
        }
        Row(
            modifier = Modifier.fillMaxWidth().padding(16.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            CallControl(
                label = if (parameters.audioAlreadyOn) "Mute" else "Unmute",
                icon = if (parameters.audioAlreadyOn) Icons.Filled.Mic else Icons.Filled.MicOff,
                active = parameters.audioAlreadyOn,
                onClick = state::toggleAudio,
            )
            Spacer(Modifier.width(14.dp))
            if (callType == "video") {
                CallControl(
                    label = if (parameters.videoAlreadyOn) "Camera off" else "Camera on",
                    icon = if (parameters.videoAlreadyOn) Icons.Filled.Videocam else Icons.Filled.VideocamOff,
                    active = parameters.videoAlreadyOn,
                    onClick = state::toggleVideo,
                )
                Spacer(Modifier.width(14.dp))
                CallControl(
                    label = if (parameters.shareScreenStarted) "Stop share" else "Share",
                    icon = if (parameters.shareScreenStarted) Icons.Filled.StopScreenShare else Icons.Filled.ScreenShare,
                    active = parameters.shareScreenStarted,
                    onClick = state::toggleScreenShare,
                )
                Spacer(Modifier.width(14.dp))
            }
            CallControl(
                label = "End",
                icon = Icons.Filled.CallEnd,
                active = false,
                destructive = true,
                onClick = ::finish,
            )
        }
    }
}

@Composable
private fun VideoSurface(surface: MediaSurface, modifier: Modifier = Modifier) {
    Card(modifier = modifier, shape = RoundedCornerShape(24.dp)) {
        Box(Modifier.fillMaxSize().background(AppColors.panelSoft)) {
            DefaultCardVideoDisplay(
                CardVideoDisplayOptions(
                    videoStream = surface.source.stream,
                    remoteProducerId = surface.source.producerId,
                    forceFullDisplay = !surface.isScreen,
                    doMirror = surface.isLocal,
                    displayLabel = surface.label,
                    showControls = false,
                )
            ).renderCompose()
            Surface(
                color = Color.Black.copy(alpha = 0.62f),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.align(Alignment.BottomStart).padding(10.dp),
            ) {
                Text(surface.label, color = Color.White, fontSize = 12.sp, modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp))
            }
            if (surface.isScreen) {
                Surface(
                    color = AppColors.greenDark,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.align(Alignment.TopStart).padding(10.dp),
                ) { Text("SCREEN SHARE", color = AppColors.text, fontSize = 11.sp, modifier = Modifier.padding(8.dp)) }
            }
        }
    }
}

@Composable
private fun ConnectingSurface(peer: String, callType: String, notice: String) {
    Column(modifier = Modifier.fillMaxSize().background(AppColors.background)) {
        Row(
            modifier = Modifier.fillMaxWidth().background(AppColors.panel).padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(peer.take(2).uppercase(), 46)
            Spacer(Modifier.width(12.dp))
            Column {
                Text(peer, color = AppColors.text, fontWeight = FontWeight.Bold)
                Text("${callType.replaceFirstChar(Char::uppercase)} call · Securing call", color = AppColors.muted)
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                CircularProgressIndicator(color = AppColors.green)
                Spacer(Modifier.height(18.dp))
                Text("Preparing your private call", color = AppColors.text, fontWeight = FontWeight.Bold)
                Text("Room creation stays behind your backend.", color = AppColors.muted)
                if (notice.isNotBlank()) Text(notice, color = AppColors.danger, modifier = Modifier.padding(12.dp))
            }
        }
    }
}

@Composable
private fun CallControl(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    destructive: Boolean = false,
    onClick: () -> Unit,
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        FilledIconButton(
            onClick = onClick,
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = when {
                    destructive -> AppColors.danger
                    active -> AppColors.greenDark
                    else -> AppColors.panelSoft
                },
                contentColor = AppColors.text,
            ),
            modifier = Modifier.size(56.dp),
        ) { Icon(icon, label) }
        Spacer(Modifier.height(4.dp))
        Text(label, color = AppColors.muted, fontSize = 11.sp)
    }
}

@Composable
private fun Avatar(text: String, size: Int) {
    Box(
        modifier = Modifier.size(size.dp).background(AppColors.greenDark, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        if (text.isBlank()) Icon(Icons.Filled.Person, null, tint = AppColors.text)
        else Text(text, color = AppColors.text, fontWeight = FontWeight.Bold)
    }
}
