import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mediasfu_sdk/mediasfu_sdk.dart';
import 'package:mediasfu_sdk/components_modern/mediasfu_components/modern_mediasfu_generic.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'session_api.dart';

void main() => runApp(const FamiliarCallApp());

class FamiliarCallApp extends StatelessWidget {
  const FamiliarCallApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'MediaSFU Familiar Calls',
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xff25d366),
        brightness: Brightness.light,
      ),
      useMaterial3: true,
    ),
    home: const FamiliarHome(),
  );
}

class _Identity {
  final String userId, displayName;
  const _Identity(this.userId, this.displayName);
}

class _CallConfig {
  final String mode, callType;
  final String? targetUserId;
  final CallSession? session;
  const _CallConfig.create(this.targetUserId, this.callType)
    : mode = 'create',
      session = null;
  const _CallConfig.join(this.session)
    : mode = 'join',
      callType = 'video',
      targetUserId = null;
}

class _CallSurface {
  final dynamic stream;
  final String producerId, label;
  final bool isLocal, isScreen;
  const _CallSurface({
    required this.stream,
    required this.producerId,
    required this.label,
    required this.isLocal,
    required this.isScreen,
  });
}

class FamiliarHome extends StatefulWidget {
  const FamiliarHome({super.key});
  @override
  State<FamiliarHome> createState() => _FamiliarHomeState();
}

class _FamiliarHomeState extends State<FamiliarHome> {
  final _userController = TextEditingController(),
      _nameController = TextEditingController(),
      _targetController = TextEditingController();
  final room = MediasfuHeadlessController();
  _Identity? identity;
  List<CallSession> sessions = [];
  _CallConfig? call;
  CallSession? activeSession;
  String notice = '';
  Timer? poll;
  bool mediaStarted = false, roleApplied = false;
  int focusIndex = 0;
  Offset miniOffset = Offset.zero;

  Offset _clampMini(Offset value, Size stage, Size preview) {
    const gap = 14.0;
    final minX = -(stage.width - preview.width - gap).clamp(
      0.0,
      double.infinity,
    );
    final maxY = (stage.height - preview.height - gap).clamp(
      -gap,
      double.infinity,
    );
    return Offset(value.dx.clamp(minX, gap), value.dy.clamp(-gap, maxY));
  }

  @override
  void initState() {
    super.initState();
    room.addListener(_roomChanged);
    unawaited(_load());
    poll = Timer.periodic(
      const Duration(milliseconds: 1800),
      (_) => unawaited(_refresh()),
    );
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getString('familiar_user_id'),
        name = prefs.getString('familiar_display_name');
    if (id != null && name != null && mounted) {
      setState(() => identity = _Identity(id, name));
      await _refresh();
    }
  }

  Future<void> _saveIdentity() async {
    final id = _userController.text.trim(), name = _nameController.text.trim();
    if (!RegExp(r'^[A-Za-z0-9_-]{2,64}$').hasMatch(id) ||
        !RegExp(r'^[A-Za-z0-9]{2,10}$').hasMatch(name)) {
      setState(
        () => notice =
            'Use a 2–64 character ID and a 2–10 character alphanumeric display name.',
      );
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('familiar_user_id', id);
    await prefs.setString('familiar_display_name', name);
    if (mounted) setState(() => identity = _Identity(id, name));
    await _refresh();
  }

  Future<void> _refresh() async {
    final current = identity;
    if (current == null) return;
    try {
      final next = await listSessions(current.userId);
      next.sort(
        (a, b) =>
            DateTime.tryParse(
              b.updatedAt,
            )?.compareTo(DateTime.tryParse(a.updatedAt) ?? DateTime(0)) ??
            0,
      );
      if (mounted) setState(() => sessions = next);
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    }
  }

  CallSession? get incoming {
    for (final session in sessions) {
      if (session.status == 'ringing' &&
          session.targetUserId == identity?.userId) {
        return session;
      }
    }
    return null;
  }

  String get peerName => call?.mode == 'create'
      ? call?.targetUserId ?? 'Contact'
      : call?.session?.hostUserId ?? 'Contact';
  void _resetEngine() {
    notice = '';
    activeSession = null;
    mediaStarted = false;
    roleApplied = false;
  }

  void _begin(String type) {
    final target = _targetController.text.trim();
    if (identity == null ||
        !RegExp(r'^[A-Za-z0-9_-]{2,64}$').hasMatch(target)) {
      setState(() => notice = 'Choose a valid contact ID.');
      return;
    }
    setState(() {
      _resetEngine();
      call = _CallConfig.create(target, type);
    });
  }

  void _accept(CallSession session) => setState(() {
    _resetEngine();
    activeSession = session;
    call = _CallConfig.join(session);
  });
  Future<void> _decline(CallSession session) async {
    if (identity == null) return;
    try {
      await endSession(session.id, identity!.userId, reason: 'declined');
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    }
    await _refresh();
  }

  Future<CreateJoinRoomResult> _createRoom(CreateMediaSFUOptions _) async {
    if (identity == null || call?.mode != 'create') {
      return CreateJoinRoomResult(
        success: false,
        data: CreateJoinRoomError(error: 'Call setup expired.'),
      );
    }
    try {
      final response = await createSession(
        hostUserId: identity!.userId,
        targetUserId: call!.targetUserId!,
        displayName: identity!.displayName,
      );
      activeSession = response.session;
      unawaited(_refresh());
      return CreateJoinRoomResult(
        success: true,
        data: CreateJoinRoomResponse.fromJson(response.data),
      );
    } catch (error) {
      final message = '$error'.replaceFirst('Exception: ', '');
      if (mounted) setState(() => notice = message);
      return CreateJoinRoomResult(
        success: false,
        data: CreateJoinRoomError(error: message),
      );
    }
  }

  Future<CreateJoinRoomResult> _joinRoom(JoinMediaSFUOptions _) async {
    if (identity == null || call?.mode != 'join') {
      return CreateJoinRoomResult(
        success: false,
        data: CreateJoinRoomError(error: 'Call invitation expired.'),
      );
    }
    try {
      final response = await joinSession(
        sessionId: call!.session!.id,
        userId: identity!.userId,
        displayName: identity!.displayName,
      );
      activeSession = response.session;
      unawaited(_refresh());
      return CreateJoinRoomResult(
        success: true,
        data: CreateJoinRoomResponse.fromJson(response.data),
      );
    } catch (error) {
      final message = '$error'.replaceFirst('Exception: ', '');
      if (mounted) setState(() => notice = message);
      return CreateJoinRoomResult(
        success: false,
        data: CreateJoinRoomError(error: message),
      );
    }
  }

  void _parametersChanged(MediasfuParameters? parameters) {
    room.updateSourceParameters(parameters);
    if (parameters != null && call != null && !roleApplied) {
      parameters.updateIslevel(call!.mode == 'create' ? '2' : '1');
      roleApplied = true;
    }
  }

  void _roomChanged() {
    if (room.ready && !mediaStarted && call != null) {
      mediaStarted = true;
      unawaited(_initialMedia());
    }
  }

  Future<void> _initialMedia() async {
    await _toggle((p) => clickAudio(ClickAudioOptions(parameters: p)));
    if (call?.callType == 'video') {
      await _toggle((p) => clickVideo(ClickVideoOptions(parameters: p)));
    }
  }

  Future<void> _toggle(Future<void> Function(MediasfuParameters) action) async {
    final parameters = room.parameters?.getCurrentParams();
    if (parameters == null) return;
    final result = await runMediaControl(parameters, () => action(parameters));
    if (!result.ok && mounted) setState(() => notice = result.error);
  }

  Future<void> _share() async {
    final parameters = room.parameters?.getCurrentParams();
    if (parameters == null) return;
    final result = await runMediaControl(
      parameters,
      () => clickScreenShare(
        ClickScreenShareOptions(parameters: parameters, context: context),
      ),
    );
    if (!result.ok && mounted) setState(() => notice = result.error);
  }

  Future<void> _finish() async {
    try {
      final parameters = room.parameters?.getCurrentParams();
      if (parameters != null && room.ready) await leaveRoom(parameters);
      if (activeSession != null && identity != null) {
        await endSession(activeSession!.id, identity!.userId);
      }
    } catch (error) {
      if (mounted) {
        setState(() => notice = '$error'.replaceFirst('Exception: ', ''));
      }
    }
    if (mounted) {
      setState(() {
        call = null;
        activeSession = null;
        _resetEngine();
      });
    }
    await _refresh();
  }

  @override
  Widget build(BuildContext context) {
    if (identity == null) return _onboarding();
    if (call == null) return _home();
    return _call();
  }

  Widget _onboarding() => _Page(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 560),
      child: _Glass(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const _Brand(),
            const SizedBox(height: 12),
            Text(
              'Your calls, without meeting codes.',
              style: Theme.of(context).textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w900,
                height: 1,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Choose an identity for this local demonstration. A production app replaces this with authenticated accounts.',
            ),
            const SizedBox(height: 18),
            TextField(
              controller: _userController,
              decoration: const InputDecoration(
                labelText: 'Your user ID',
                hintText: 'alex',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _nameController,
              maxLength: 10,
              decoration: const InputDecoration(
                labelText: 'Display name',
                hintText: 'Alex',
                border: OutlineInputBorder(),
              ),
            ),
            FilledButton(
              onPressed: _saveIdentity,
              child: const Text('Continue'),
            ),
            if (notice.isNotEmpty) _Error(notice),
          ],
        ),
      ),
    ),
  );
  Widget _home() {
    final invite = incoming;
    return _Page(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 900),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _Brand(),
                    Text(
                      'Calls',
                      style: Theme.of(context).textTheme.displaySmall?.copyWith(
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ],
                ),
                _Avatar(identity!.displayName),
              ],
            ),
            if (invite != null) ...[
              const SizedBox(height: 20),
              _Glass(
                dark: true,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Text(
                      'INCOMING CALL',
                      style: TextStyle(
                        color: Color(0xff65e89a),
                        fontWeight: FontWeight.w900,
                        letterSpacing: 1.4,
                      ),
                    ),
                    Text(
                      invite.displayName.isNotEmpty
                          ? invite.displayName
                          : invite.hostUserId,
                      style: Theme.of(context).textTheme.headlineMedium
                          ?.copyWith(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                          ),
                    ),
                    Text(
                      '${invite.hostUserId} is calling securely.',
                      style: const TextStyle(color: Color(0xffc7e6d3)),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                            onPressed: () => _decline(invite),
                            child: const Text('Decline'),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: FilledButton(
                            onPressed: () => _accept(invite),
                            child: const Text('Accept'),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 20),
            _Glass(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _targetController,
                    decoration: const InputDecoration(
                      labelText: 'Call a contact',
                      hintText: 'Contact user ID',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: () => _begin('audio'),
                          icon: const Icon(Icons.call),
                          label: const Text('Audio call'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: () => _begin('video'),
                          icon: const Icon(Icons.videocam),
                          label: const Text('Video call'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  'Recent calls',
                  style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                Text('${sessions.length}'),
              ],
            ),
            if (sessions.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Text('No calls yet. Choose a contact to begin.'),
              ),
            ...sessions.map((session) {
              final other = session.hostUserId == identity!.userId
                  ? session.targetUserId
                  : session.hostUserId;
              return ListTile(
                contentPadding: EdgeInsets.zero,
                leading: _Avatar(other, small: true),
                title: Text(
                  other,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text('${session.status} · ${session.updatedAt}'),
              );
            }),
            if (notice.isNotEmpty) _Error(notice),
          ],
        ),
      ),
    );
  }

  Widget _call() {
    final create = call!.mode == 'create';
    final engine = ModernMediasfuGeneric(
      key: ValueKey('${activeSession?.id ?? ''}-$peerName'),
      options: ModernMediasfuGenericOptions(
        returnUI: false,
        noUIPreJoinOptionsCreate: create
            ? CreateMediaSFURoomOptions(
                action: 'create',
                duration: 30,
                capacity: 2,
                userName: identity!.displayName,
                eventType: EventType.conference,
              )
            : null,
        noUIPreJoinOptionsJoin: !create
            ? JoinMediaSFURoomOptions(
                action: 'join',
                meetingID: call!.session!.meetingId,
                userName: identity!.displayName,
              )
            : null,
        createMediaSFURoom: _createRoom,
        joinMediaSFURoom: _joinRoom,
        updateSourceParameters: _parametersChanged,
      ),
    );
    return Scaffold(
      backgroundColor: const Color(0xff071713),
      body: SafeArea(
        child: Stack(
          children: [
            engine,
            AnimatedBuilder(
              animation: room,
              builder: (context, _) {
                final current = room.parameters?.getCurrentParams();
                final screen = room.screenShare,
                    remote = room.remoteVideos,
                    local = room.localVideo;
                final surfaces = <_CallSurface>[
                  if (screen.stream != null)
                    _CallSurface(
                      stream: screen.stream,
                      producerId: current?.screenId ?? 'screen',
                      label: screen.isLocal
                          ? 'Your screen'
                          : "$peerName's screen",
                      isLocal: screen.isLocal,
                      isScreen: true,
                    ),
                  if (remote.isNotEmpty)
                    _CallSurface(
                      stream: remote.first.stream,
                      producerId: remote.first.producerId,
                      label: peerName,
                      isLocal: false,
                      isScreen: false,
                    ),
                  if (local != null)
                    _CallSurface(
                      stream: local,
                      producerId: 'local',
                      label: 'You',
                      isLocal: true,
                      isScreen: false,
                    ),
                ];
                final screenActive =
                    surfaces.isNotEmpty && surfaces.first.isScreen;
                final normalizedFocus = screenActive
                    ? 0
                    : focusIndex.clamp(
                        0,
                        (surfaces.length - 1).clamp(0, surfaces.length),
                      );
                final primary = surfaces.isEmpty
                    ? null
                    : surfaces[normalizedFocus];
                final previews = <_CallSurface>[
                  for (var index = 0; index < surfaces.length; index++)
                    if (index != normalizedFocus) surfaces[index],
                ];
                void swapFocus() {
                  if (screenActive || surfaces.length < 2) return;
                  setState(() => focusIndex = focusIndex == 0 ? 1 : 0);
                }

                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          _Avatar(peerName),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  peerName,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w900,
                                    fontSize: 18,
                                  ),
                                ),
                                Text(
                                  room.ready
                                      ? '${room.participants.length} connected'
                                      : room.readiness.reason,
                                  style: const TextStyle(
                                    color: Color(0xffa9c7be),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),
                      Expanded(
                        child: LayoutBuilder(
                          builder: (context, constraints) {
                            final stageSize = Size(
                              constraints.maxWidth,
                              constraints.maxHeight,
                            );
                            final previewWidth = (constraints.maxWidth * .32)
                                .clamp(112.0, 190.0);
                            final previewHeight = previewWidth * .625;
                            final stripSize = Size(
                              previewWidth,
                              previewHeight * previews.length +
                                  8 *
                                      (previews.length - 1).clamp(
                                        0,
                                        previews.length,
                                      ),
                            );
                            final boundedOffset = _clampMini(
                              miniOffset,
                              stageSize,
                              stripSize,
                            );
                            Widget mediaCard(
                              _CallSurface surface, {
                              required bool compact,
                            }) => CardVideoDisplay(
                              options: CardVideoDisplayOptions(
                                remoteProducerId: surface.producerId,
                                eventType:
                                    current?.eventType ?? EventType.conference,
                                forceFullDisplay: !surface.isScreen,
                                videoStream: surface.stream,
                                doMirror: surface.isLocal && !surface.isScreen,
                                backgroundColor: const Color(0xff0d2924),
                              ),
                            );
                            return ClipRRect(
                              borderRadius: BorderRadius.circular(28),
                              child: Stack(
                                children: [
                                  Positioned.fill(
                                    child: primary == null
                                        ? Container(
                                            color: const Color(0xff0d2924),
                                            child: Center(
                                              child: Column(
                                                mainAxisSize: MainAxisSize.min,
                                                children: [
                                                  _Avatar(
                                                    peerName,
                                                    large: true,
                                                  ),
                                                  const SizedBox(height: 18),
                                                  Text(
                                                    room.ready
                                                        ? 'Audio call'
                                                        : 'Connecting securely…',
                                                    style: const TextStyle(
                                                      color: Colors.white,
                                                      fontWeight:
                                                          FontWeight.w800,
                                                    ),
                                                  ),
                                                ],
                                              ),
                                            ),
                                          )
                                        : GestureDetector(
                                            onDoubleTap: swapFocus,
                                            child: mediaCard(
                                              primary,
                                              compact: false,
                                            ),
                                          ),
                                  ),
                                  if (previews.isNotEmpty)
                                    Positioned(
                                      top: 14 + boundedOffset.dy,
                                      right: 14 - boundedOffset.dx,
                                      child: GestureDetector(
                                        onDoubleTap: swapFocus,
                                        onPanUpdate: (details) => setState(
                                          () => miniOffset = _clampMini(
                                            miniOffset + details.delta,
                                            stageSize,
                                            stripSize,
                                          ),
                                        ),
                                        child: Column(
                                          children: [
                                            for (final surface in previews)
                                              Padding(
                                                padding: const EdgeInsets.only(
                                                  bottom: 8,
                                                ),
                                                child: Container(
                                                  width: previewWidth,
                                                  height: previewHeight,
                                                  decoration: BoxDecoration(
                                                    border: Border.all(
                                                      color: const Color(
                                                        0xff8cd8aa,
                                                      ),
                                                      width: 2,
                                                    ),
                                                    borderRadius:
                                                        BorderRadius.circular(
                                                          16,
                                                        ),
                                                    boxShadow: const [
                                                      BoxShadow(
                                                        color: Colors.black54,
                                                        blurRadius: 20,
                                                      ),
                                                    ],
                                                  ),
                                                  clipBehavior: Clip.antiAlias,
                                                  child: Stack(
                                                    children: [
                                                      Positioned.fill(
                                                        child: mediaCard(
                                                          surface,
                                                          compact: true,
                                                        ),
                                                      ),
                                                      Positioned(
                                                        left: 8,
                                                        bottom: 7,
                                                        child: DecoratedBox(
                                                          decoration: BoxDecoration(
                                                            color: const Color(
                                                              0xcc03100c,
                                                            ),
                                                            borderRadius:
                                                                BorderRadius.circular(
                                                                  999,
                                                                ),
                                                          ),
                                                          child: Padding(
                                                            padding:
                                                                const EdgeInsets.symmetric(
                                                                  horizontal: 7,
                                                                  vertical: 4,
                                                                ),
                                                            child: Text(
                                                              surface.label,
                                                              style: const TextStyle(
                                                                color: Colors
                                                                    .white,
                                                                fontSize: 10,
                                                                fontWeight:
                                                                    FontWeight
                                                                        .w800,
                                                              ),
                                                            ),
                                                          ),
                                                        ),
                                                      ),
                                                    ],
                                                  ),
                                                ),
                                              ),
                                          ],
                                        ),
                                      ),
                                    ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                      if (previews.isNotEmpty)
                        const Padding(
                          padding: EdgeInsets.only(top: 8),
                          child: Text(
                            'Double-tap to swap views · Drag the small view to move it',
                            style: TextStyle(
                              color: Color(0xff8ba99b),
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      if (notice.isNotEmpty) _Error(notice),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 10,
                        children: [
                          IconButton.filledTonal(
                            onPressed: room.ready
                                ? () => _toggle(
                                    (p) => clickAudio(
                                      ClickAudioOptions(parameters: p),
                                    ),
                                  )
                                : null,
                            icon: const Icon(Icons.mic),
                          ),
                          IconButton.filledTonal(
                            onPressed: room.ready
                                ? () => _toggle(
                                    (p) => clickVideo(
                                      ClickVideoOptions(parameters: p),
                                    ),
                                  )
                                : null,
                            icon: const Icon(Icons.videocam),
                          ),
                          IconButton.filledTonal(
                            onPressed: room.ready ? _share : null,
                            icon: const Icon(Icons.screen_share),
                          ),
                          IconButton.filled(
                            onPressed: _finish,
                            style: IconButton.styleFrom(
                              backgroundColor: const Color(0xffe94f5f),
                            ),
                            icon: const Icon(Icons.call_end),
                          ),
                        ],
                      ),
                      if (current != null)
                        Offstage(
                          offstage: true,
                          child: Column(
                            children: getAudioGridComponents(current),
                          ),
                        ),
                    ],
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    poll?.cancel();
    room.removeListener(_roomChanged);
    if (room.ready) {
      final parameters = room.parameters?.getCurrentParams();
      if (parameters != null) unawaited(leaveRoom(parameters));
    }
    room.dispose();
    _userController.dispose();
    _nameController.dispose();
    _targetController.dispose();
    super.dispose();
  }
}

class _Page extends StatelessWidget {
  final Widget child;
  const _Page({required this.child});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: Container(
      decoration: const BoxDecoration(
        gradient: RadialGradient(
          center: Alignment(0.8, -1),
          radius: 1.5,
          colors: [Color(0xffd9f8e5), Color(0xfff4f8f5)],
        ),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(child: child),
        ),
      ),
    ),
  );
}

class _Glass extends StatelessWidget {
  final Widget child;
  final bool dark;
  const _Glass({required this.child, this.dark = false});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(24),
    decoration: BoxDecoration(
      color: dark
          ? const Color(0xff0b372c)
          : Colors.white.withValues(alpha: .9),
      borderRadius: BorderRadius.circular(28),
      boxShadow: const [
        BoxShadow(
          color: Color(0x18335c48),
          blurRadius: 60,
          offset: Offset(0, 24),
        ),
      ],
    ),
    child: child,
  );
}

class _Brand extends StatelessWidget {
  const _Brand();
  @override
  Widget build(BuildContext context) => const Text(
    'MEDIASFU FAMILIAR',
    style: TextStyle(
      color: Color(0xff168c4a),
      fontSize: 12,
      fontWeight: FontWeight.w900,
      letterSpacing: 1.5,
    ),
  );
}

class _Avatar extends StatelessWidget {
  final String label;
  final bool small, large;
  const _Avatar(this.label, {this.small = false, this.large = false});
  @override
  Widget build(BuildContext context) {
    final size = large
        ? 96.0
        : small
        ? 42.0
        : 48.0;
    final safe = label.trim().isEmpty ? '?' : label.trim();
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(
        color: Color(0xff25d366),
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Text(
        safe.substring(0, safe.length.clamp(1, 2)).toUpperCase(),
        style: TextStyle(
          color: const Color(0xff063420),
          fontWeight: FontWeight.w900,
          fontSize: large ? 26 : 14,
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  final String message;
  const _Error(this.message);
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 12),
    child: Text(
      message,
      style: const TextStyle(
        color: Color(0xffe94f5f),
        fontWeight: FontWeight.w700,
      ),
    ),
  );
}
