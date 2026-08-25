import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'whip_whep/presentation.dart';
import 'whip_whep/protocol.dart';
import 'whip_whep/protocol_api.dart';

void main() => runApp(const FamiliarWhipWhepApp());

String _defaultApiOrigin() {
  const configured = String.fromEnvironment(
    'CALL_API_ORIGIN',
    defaultValue: '',
  );
  if (configured.isNotEmpty) return configured;
  if (kIsWeb) return 'http://127.0.0.1:8790';
  return defaultTargetPlatform == TargetPlatform.android
      ? 'http://10.0.2.2:8790'
      : 'http://127.0.0.1:8790';
}

class Identity {
  final String userId;
  final String displayName;
  const Identity(this.userId, this.displayName);
}

class FamiliarWhipWhepApp extends StatelessWidget {
  const FamiliarWhipWhepApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'Familiar WHIP/WHEP calls',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff237446),
        surface: const Color(0xfff4f8f4),
      ),
      scaffoldBackgroundColor: const Color(0xffeef7f1),
      useMaterial3: true,
      inputDecorationTheme: const InputDecorationTheme(
        filled: true,
        fillColor: Color(0xfff8fbf9),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(14)),
        ),
      ),
    ),
    home: const FamiliarWhipWhepShell(),
  );
}

class FamiliarWhipWhepShell extends StatefulWidget {
  const FamiliarWhipWhepShell({super.key});
  @override
  State<FamiliarWhipWhepShell> createState() => _FamiliarWhipWhepShellState();
}

class _FamiliarWhipWhepShellState extends State<FamiliarWhipWhepShell> {
  late final ProtocolApi api = ProtocolApi(_defaultApiOrigin());
  Identity? identity;
  List<ProtocolSession> sessions = const [];
  ProtocolSession? active;
  FlutterWhipWhepTransport? transport;
  Timer? timer;
  bool ready = false;
  String notice = '';

  @override
  void initState() {
    super.initState();
    unawaited(_restore());
  }

  Future<void> _restore() async {
    final preferences = await SharedPreferences.getInstance();
    final userId = preferences.getString('whipWhepUserId');
    final displayName = preferences.getString('whipWhepDisplayName');
    if (userId != null && displayName != null) {
      identity = Identity(userId, displayName);
    }
    if (mounted) setState(() => ready = true);
    _startPolling();
  }

  void _startPolling() {
    timer?.cancel();
    if (identity == null) return;
    unawaited(_refresh());
    timer = Timer.periodic(
      const Duration(milliseconds: 1500),
      (_) => unawaited(_refresh()),
    );
  }

  Future<void> _refresh() async {
    final currentIdentity = identity;
    if (currentIdentity == null) return;
    try {
      final next = await api.listSessions(currentIdentity.userId);
      next.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
      final current = active == null
          ? null
          : next.where((item) => item.id == active!.id).firstOrNull;
      if (current?.status == 'ended') await _leave(notifyBackend: false);
      if (mounted) {
        setState(() {
          sessions = next;
          notice = '';
        });
      }
    } catch (_) {
      if (mounted && active == null) {
        setState(() => notice = 'Backend reconnecting…');
      }
    }
  }

  Future<void> _saveIdentity(String userId, String displayName) async {
    final preferences = await SharedPreferences.getInstance();
    await preferences.setString('whipWhepUserId', userId);
    await preferences.setString('whipWhepDisplayName', displayName);
    setState(() => identity = Identity(userId, displayName));
    _startPolling();
  }

  Future<void> _resetIdentity() async {
    timer?.cancel();
    final preferences = await SharedPreferences.getInstance();
    await preferences.remove('whipWhepUserId');
    await preferences.remove('whipWhepDisplayName');
    setState(() {
      identity = null;
      sessions = const [];
    });
  }

  Future<void> _enter(ProtocolSession session) async {
    final currentIdentity = identity!;
    final next = FlutterWhipWhepTransport(api);
    next.addListener(_transportChanged);
    setState(() {
      active = session;
      transport = next;
      notice = '';
    });
    try {
      await next.start(
        session,
        currentIdentity.userId,
        currentIdentity.displayName,
      );
    } catch (_) {}
  }

  void _transportChanged() {
    if (mounted) setState(() {});
  }

  Future<void> _create(String targetUserId, String callType) async {
    try {
      final session = await api.createCall(
        hostUserId: identity!.userId,
        targetUserId: targetUserId,
        displayName: identity!.displayName,
        callType: callType,
      );
      unawaited(_enter(session));
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _accept(ProtocolSession session) async {
    if (active != null) return;
    try {
      final accepted = await api.acceptCall(session.id, identity!.userId);
      unawaited(_enter(accepted));
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    }
  }

  Future<void> _leave({
    bool notifyBackend = true,
    ProtocolSession? selected,
    String reason = 'user_ended',
  }) async {
    final session = selected ?? active;
    final currentTransport = transport;
    transport = null;
    currentTransport?.removeListener(_transportChanged);
    await currentTransport?.stop();
    currentTransport?.dispose();
    if (notifyBackend && session != null && identity != null) {
      try {
        await api.endCall(session.id, identity!.userId, reason: reason);
      } catch (error) {
        notice = '$error'.replaceFirst('Exception: ', '');
      }
    }
    if (mounted) setState(() => active = null);
    unawaited(_refresh());
  }

  @override
  void dispose() {
    timer?.cancel();
    transport?.removeListener(_transportChanged);
    transport?.dispose();
    api.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!ready) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (identity == null) return OnboardingPage(onComplete: _saveIdentity);
    if (active != null && transport != null) {
      return ProtocolCallPage(
        identity: identity!,
        session: active!,
        transport: transport!,
        onEnd: _leave,
      );
    }
    final incoming = sessions
        .where(
          (session) =>
              session.targetUserId == identity!.userId &&
              session.status == 'ringing',
        )
        .firstOrNull;
    return HomePage(
      identity: identity!,
      sessions: sessions,
      incoming: incoming,
      notice: notice,
      onCreate: _create,
      onAccept: _accept,
      onDecline: (session) => _leave(selected: session, reason: 'declined'),
      onReset: _resetIdentity,
    );
  }
}

class OnboardingPage extends StatefulWidget {
  final Future<void> Function(String userId, String displayName) onComplete;
  const OnboardingPage({super.key, required this.onComplete});
  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final user = TextEditingController();
  final name = TextEditingController();
  String error = '';
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Column(
              children: [
                Container(
                  width: 58,
                  height: 58,
                  decoration: BoxDecoration(
                    color: const Color(0xff237446),
                    borderRadius: BorderRadius.circular(18),
                  ),
                  alignment: Alignment.center,
                  child: const Text(
                    'M',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                const _Eyebrow('MEDIA CALLS · WHIP + WHEP'),
                const SizedBox(height: 10),
                const Text(
                  'Calls that feel instantly familiar.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 35,
                    height: 1.05,
                    fontWeight: FontWeight.w800,
                    color: Color(0xff10251c),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  'Choose a demo identity once. You call a person—not a room—and credentials stay on your backend.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xff5c7165), height: 1.45),
                ),
                _Card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Display name'),
                      const SizedBox(height: 6),
                      TextField(
                        key: const Key('display-name'),
                        controller: name,
                        decoration: const InputDecoration(hintText: 'Alex'),
                      ),
                      const SizedBox(height: 14),
                      const Text('Your user ID'),
                      const SizedBox(height: 6),
                      TextField(
                        key: const Key('user-id'),
                        controller: user,
                        decoration: const InputDecoration(hintText: 'alex-01'),
                        autocorrect: false,
                      ),
                      if (error.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 10),
                          child: Text(
                            error,
                            style: const TextStyle(color: Color(0xffa43d44)),
                          ),
                        ),
                      const SizedBox(height: 16),
                      FilledButton(
                        key: const Key('continue'),
                        onPressed: () async {
                          final userId = user.text.trim();
                          final displayName = name.text.trim();
                          if (!RegExp(
                            r'^[A-Za-z0-9_-]{2,64}$',
                          ).hasMatch(userId)) {
                            setState(
                              () => error =
                                  'Use 2–64 letters, numbers, underscores, or hyphens.',
                            );
                            return;
                          }
                          if (!RegExp(
                            r'^[A-Za-z0-9]{2,10}$',
                          ).hasMatch(displayName)) {
                            setState(
                              () => error =
                                  'Use 2–10 letters or numbers for your display name.',
                            );
                            return;
                          }
                          await widget.onComplete(userId, displayName);
                        },
                        child: const Text('Continue to calls  →'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                const Text(
                  'No MediaSFU client SDK is loaded. Media uses standards-based WHIP publishing and WHEP playback.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: Color(0xff6c8074)),
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class HomePage extends StatefulWidget {
  final Identity identity;
  final List<ProtocolSession> sessions;
  final ProtocolSession? incoming;
  final String notice;
  final Future<void> Function(String, String) onCreate;
  final Future<void> Function(ProtocolSession) onAccept;
  final Future<void> Function(ProtocolSession) onDecline;
  final Future<void> Function() onReset;
  const HomePage({
    super.key,
    required this.identity,
    required this.sessions,
    required this.incoming,
    required this.notice,
    required this.onCreate,
    required this.onAccept,
    required this.onDecline,
    required this.onReset,
  });
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final target = TextEditingController();
  String callType = 'video';
  String localError = '';
  String peer(ProtocolSession session) =>
      session.hostUserId == widget.identity.userId
      ? session.targetUserId
      : session.hostUserId;
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    _Eyebrow('PROTOCOL-NATIVE MEDIA'),
                    Text(
                      'Chats & calls',
                      style: TextStyle(
                        fontSize: 30,
                        fontWeight: FontWeight.w800,
                        color: Color(0xff10251c),
                      ),
                    ),
                  ],
                ),
              ),
              TextButton.icon(
                key: const Key('change-identity'),
                onPressed: widget.onReset,
                icon: CircleAvatar(
                  child: Text(
                    widget.identity.displayName.substring(0, 2).toUpperCase(),
                  ),
                ),
                label: Text('@${widget.identity.userId}'),
              ),
            ],
          ),
          const Align(
            alignment: Alignment.centerLeft,
            child: Chip(label: Text('●  Ready for calls · WHIP/WHEP')),
          ),
          if (widget.incoming != null)
            _Card(
              dark: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'INCOMING ${widget.incoming!.callType.toUpperCase()} CALL',
                    style: const TextStyle(
                      color: Color(0xff7fe0a8),
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                  Text(
                    widget.incoming!.displayName,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  Text(
                    '@${widget.incoming!.hostUserId} is calling',
                    style: const TextStyle(color: Color(0xffb7cfc2)),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          key: const Key('decline'),
                          onPressed: () => widget.onDecline(widget.incoming!),
                          child: const Text('Decline'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          key: const Key('accept'),
                          onPressed: () => widget.onAccept(widget.incoming!),
                          child: const Text('Accept call'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Start a call',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const Text(
                  'Invite someone by user ID. Room details stay invisible.',
                  style: TextStyle(color: Color(0xff5c7165)),
                ),
                const SizedBox(height: 14),
                TextField(
                  key: const Key('target-user'),
                  controller: target,
                  decoration: const InputDecoration(hintText: 'friend-user-id'),
                ),
                const SizedBox(height: 10),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(
                      value: 'video',
                      label: Text('Video'),
                      icon: Icon(Icons.videocam_outlined),
                    ),
                    ButtonSegment(
                      value: 'audio',
                      label: Text('Audio'),
                      icon: Icon(Icons.call_outlined),
                    ),
                  ],
                  selected: {callType},
                  onSelectionChanged: (value) =>
                      setState(() => callType = value.first),
                ),
                if ((localError.isNotEmpty ? localError : widget.notice)
                    .isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      localError.isNotEmpty ? localError : widget.notice,
                      style: const TextStyle(color: Color(0xffa43d44)),
                    ),
                  ),
                const SizedBox(height: 14),
                FilledButton(
                  key: const Key('call-now'),
                  onPressed: () {
                    final value = target.text.trim();
                    if (!RegExp(r'^[A-Za-z0-9_-]{2,64}$').hasMatch(value) ||
                        value == widget.identity.userId) {
                      setState(
                        () => localError = value == widget.identity.userId
                            ? 'Choose another person.'
                            : 'Enter a valid contact user ID.',
                      );
                      return;
                    }
                    setState(() => localError = '');
                    widget.onCreate(value, callType);
                  },
                  child: const Text('Call now  →'),
                ),
              ],
            ),
          ),
          _Card(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'Recent calls',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800),
                ),
                if (widget.sessions.isEmpty)
                  const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: Text(
                      'Your contact calls will appear here.',
                      style: TextStyle(color: Color(0xff5c7165)),
                    ),
                  ),
                ...widget.sessions
                    .take(8)
                    .map(
                      (session) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: CircleAvatar(
                          child: Text(
                            peer(session).substring(0, 2).toUpperCase(),
                          ),
                        ),
                        title: Text(peer(session)),
                        subtitle: Text(
                          '${session.callType} · ${session.status}',
                        ),
                        trailing: const Icon(Icons.chevron_right),
                        enabled: session.status != 'ended',
                        onTap: () => widget.onAccept(session),
                      ),
                    ),
              ],
            ),
          ),
        ],
      ),
    ),
  );
}

class ProtocolCallPage extends StatefulWidget {
  final Identity identity;
  final ProtocolSession session;
  final FlutterWhipWhepTransport transport;
  final Future<void> Function({
    bool notifyBackend,
    ProtocolSession? selected,
    String reason,
  })
  onEnd;
  const ProtocolCallPage({
    super.key,
    required this.identity,
    required this.session,
    required this.transport,
    required this.onEnd,
  });
  @override
  State<ProtocolCallPage> createState() => _ProtocolCallPageState();
}

class _ProtocolCallPageState extends State<ProtocolCallPage> {
  final primaryRenderer = RTCVideoRenderer();
  final miniRenderer = RTCVideoRenderer();
  final audioRenderer = RTCVideoRenderer();
  bool remotePrimary = true;
  bool micOn = true;
  bool cameraOn = true;
  bool screenOn = false;
  Offset miniOffset = Offset.zero;
  Size stageSize = Size.zero;
  Size miniSize = const Size(112, 154);

  String get peer => widget.session.hostUserId == widget.identity.userId
      ? widget.session.targetUserId
      : widget.session.hostUserId;

  @override
  void initState() {
    super.initState();
    cameraOn = widget.session.callType != 'audio';
    unawaited(primaryRenderer.initialize());
    unawaited(miniRenderer.initialize());
    unawaited(audioRenderer.initialize());
    widget.transport.addListener(_syncRenderers);
    _syncRenderers();
  }

  ProtocolPresentation get presentation => resolveProtocolPresentation(
    localStream: widget.transport.localStream,
    remoteStream: widget.transport.remoteVideoStream,
    remoteAudioStream: widget.transport.remoteStream,
    screenStream: widget.transport.screenStream,
    remoteScreenActive: widget.transport.remoteScreenActive,
    remotePrimary: remotePrimary,
  );

  void _syncRenderers() {
    final media = presentation;
    primaryRenderer.srcObject = media.primary?.stream;
    miniRenderer.srcObject = media.mini?.stream;
    audioRenderer.srcObject = media.remoteAudioStream;
    if (media.screenActive) remotePrimary = true;
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.transport.removeListener(_syncRenderers);
    primaryRenderer.dispose();
    miniRenderer.dispose();
    audioRenderer.dispose();
    super.dispose();
  }

  Widget _video(RTCVideoRenderer renderer, ProtocolSurface surface) => Stack(
    fit: StackFit.expand,
    children: [
      RTCVideoView(
        renderer,
        mirror: surface.isLocal && surface.kind == ProtocolSurfaceKind.camera,
        objectFit: surface.kind == ProtocolSurfaceKind.screen
            ? RTCVideoViewObjectFit.RTCVideoViewObjectFitContain
            : RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
      ),
      Positioned(
        left: 9,
        bottom: 8,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: Colors.black54,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Text(
              surface.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 11,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    ],
  );

  void _doubleActivate() {
    if (!presentation.canSwap) return;
    setState(() => remotePrimary = !remotePrimary);
    _syncRenderers();
  }

  @override
  Widget build(BuildContext context) {
    final media = presentation;
    return Scaffold(
      backgroundColor: const Color(0xff071b13),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(child: Text(peer.substring(0, 2).toUpperCase())),
                  const SizedBox(width: 11),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          peer,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          '${widget.session.callType} call · ${widget.transport.phase}',
                          style: const TextStyle(
                            color: Color(0xffa9c5b5),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Chip(
                    label: Text(
                      widget.transport.error.isNotEmpty
                          ? 'Issue'
                          : widget.transport.phase == 'Live'
                          ? '● Live'
                          : 'Securing',
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    stageSize = constraints.biggest;
                    return ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: Container(
                        key: const Key('media-stage'),
                        color: const Color(0xff102b20),
                        child: Stack(
                          children: [
                            if (media.primary != null)
                              Positioned.fill(
                                child: GestureDetector(
                                  key: const Key('main-media'),
                                  onDoubleTap: _doubleActivate,
                                  child: _video(
                                    primaryRenderer,
                                    media.primary!,
                                  ),
                                ),
                              )
                            else
                              Center(
                                child: Column(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    CircleAvatar(
                                      radius: 52,
                                      child: Text(
                                        peer.substring(0, 2).toUpperCase(),
                                        style: const TextStyle(
                                          fontSize: 36,
                                          fontWeight: FontWeight.w900,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 14),
                                    const CircularProgressIndicator(),
                                    const SizedBox(height: 12),
                                    Text(
                                      widget.transport.phase,
                                      style: const TextStyle(
                                        color: Colors.white,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            if (media.mini != null)
                              Positioned(
                                right: 14 - miniOffset.dx,
                                top: 14 + miniOffset.dy,
                                child: GestureDetector(
                                  key: const Key('mini-media'),
                                  onDoubleTap: _doubleActivate,
                                  onPanUpdate: (details) => setState(
                                    () => miniOffset = clampProtocolMiniOffset(
                                      miniOffset + details.delta,
                                      stageSize,
                                      miniSize,
                                    ),
                                  ),
                                  child: Container(
                                    width: miniSize.width,
                                    height: miniSize.height,
                                    clipBehavior: Clip.hardEdge,
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(20),
                                      border: Border.all(
                                        color: Colors.white,
                                        width: 2,
                                      ),
                                      color: const Color(0xff173b2b),
                                    ),
                                    child: _video(miniRenderer, media.mini!),
                                  ),
                                ),
                              ),
                            const Positioned(
                              left: 12,
                              top: 12,
                              child: Chip(
                                label: Text('WHIP publish · WHEP play'),
                              ),
                            ),
                            if (media.remoteAudioStream != null)
                              Positioned(
                                left: -2,
                                bottom: -2,
                                child: SizedBox(
                                  width: 1,
                                  height: 1,
                                  child: RTCVideoView(audioRenderer),
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            if (widget.transport.error.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(
                  widget.transport.error,
                  style: const TextStyle(color: Color(0xffffd2d5)),
                ),
              ),
            Padding(
              padding: const EdgeInsets.only(top: 9),
              child: Text(
                media.canSwap
                    ? 'Double-tap either view to swap · drag the small view'
                    : media.screenActive
                    ? 'Screen share stays on the main stage'
                    : 'Waiting for both camera views',
                style: const TextStyle(color: Color(0xff91aa9c), fontSize: 11),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CallAction(
                    icon: micOn ? Icons.mic : Icons.mic_off,
                    label: micOn ? 'Mute' : 'Unmute',
                    onTap: () =>
                        setState(() => micOn = widget.transport.toggleAudio()),
                  ),
                  if (widget.session.callType != 'audio') ...[
                    const SizedBox(width: 14),
                    _CallAction(
                      icon: cameraOn ? Icons.videocam : Icons.videocam_off,
                      label: cameraOn ? 'Camera off' : 'Camera on',
                      onTap: () => setState(
                        () => cameraOn = widget.transport.toggleVideo(),
                      ),
                    ),
                    const SizedBox(width: 14),
                    _CallAction(
                      icon: Icons.screen_share_outlined,
                      label: screenOn ? 'Stop share' : 'Share screen',
                      onTap: () async {
                        try {
                          final enabled = await widget.transport.toggleScreen(
                            widget.session.id,
                            widget.identity.userId,
                          );
                          if (mounted) setState(() => screenOn = enabled);
                        } catch (error) {
                          widget.transport.reportError(
                            'Screen sharing unavailable',
                            error,
                          );
                        }
                      },
                    ),
                  ],
                  const SizedBox(width: 14),
                  _CallAction(
                    icon: Icons.call_end,
                    label: 'End',
                    danger: true,
                    onTap: () => widget.onEnd(),
                  ),
                ],
              ),
            ),
            const Padding(
              padding: EdgeInsets.fromLTRB(30, 0, 30, 12),
              child: Text(
                'SDK-free media: short-lived protocol resources come from your backend; account credentials never enter this app.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xff6f8f7d), fontSize: 10),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CallAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool danger;
  const _CallAction({
    required this.icon,
    required this.label,
    required this.onTap,
    this.danger = false,
  });
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    borderRadius: BorderRadius.circular(20),
    child: Container(
      width: 82,
      height: 66,
      decoration: BoxDecoration(
        color: danger ? const Color(0xffc8434c) : const Color(0xff173b2b),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: danger ? Colors.white : const Color(0xff8fe1b3)),
          const SizedBox(height: 4),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 11),
          ),
        ],
      ),
    ),
  );
}

class _Card extends StatelessWidget {
  final Widget child;
  final bool dark;
  const _Card({required this.child, this.dark = false});
  @override
  Widget build(BuildContext context) => Container(
    margin: const EdgeInsets.only(top: 18),
    padding: const EdgeInsets.all(20),
    decoration: BoxDecoration(
      color: dark ? const Color(0xff173f2d) : Colors.white,
      borderRadius: BorderRadius.circular(24),
      boxShadow: const [
        BoxShadow(
          color: Color(0x10173b29),
          blurRadius: 18,
          offset: Offset(0, 8),
        ),
      ],
    ),
    child: child,
  );
}

class _Eyebrow extends StatelessWidget {
  final String value;
  const _Eyebrow(this.value);
  @override
  Widget build(BuildContext context) => Text(
    value,
    style: const TextStyle(
      color: Color(0xff288059),
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.5,
    ),
  );
}
