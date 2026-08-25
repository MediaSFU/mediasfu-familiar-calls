using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MediaSFU.FamiliarCall.Backend;
using MediaSFU.FamiliarCall.Media;
using MediaSFU.FamiliarCall.Presentation;
using Unity.WebRTC;
using UnityEngine;

namespace MediaSFU.FamiliarCall
{
    /// <summary>
    /// A scene-free bootstrap makes the sample immediately runnable. The UI is
    /// intentionally contact-first: participants never type or see room IDs.
    /// </summary>
    public sealed class FamiliarCallApp : MonoBehaviour
    {
        private const string DisplayNameKey = "mediasfu.familiar.displayName";
        private const string UserIdKey = "mediasfu.familiar.userId";
        private const float PollInterval = 1.5f;
        private CallBackendClient backend;
        private WhipWhepProtocol protocol;
        private LocalMediaCapture capture;
        private CallSession[] sessions = Array.Empty<CallSession>();
        private CallSession incoming;
        private CallSession active;
        private Texture remoteCamera;
        private Texture screenShare;
        private string screenSurfaceId = "screen";
        private string focusedSurfaceId;
        private string displayName;
        private string userId;
        private string targetUserId = string.Empty;
        private string callType = "video";
        private string phase = "Ready for calls";
        private string notice = string.Empty;
        private float nextSessionPoll;
        private float nextPeerPoll;
        private bool pollingSessions;
        private bool pollingPeer;
        private bool playbackStarting;
        private bool playbackActive;
        private bool ending;
        private bool draggingMini;
        private Vector2 dragOrigin;
        private Vector2 pointerOrigin;
        private Vector2 miniOffset;
        private GUIStyle heading;
        private GUIStyle subheading;
        private GUIStyle body;
        private GUIStyle button;
        private GUIStyle dangerButton;
        private GUIStyle input;
        private GUIStyle badge;
        private Texture2D white;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Bootstrap()
        {
            if (FindObjectOfType<FamiliarCallApp>() != null) return;
            DontDestroyOnLoad(new GameObject("MediaSFU Familiar Call · Unity WHIP WHEP")
                .AddComponent<FamiliarCallApp>().gameObject);
        }

        private void Awake()
        {
            Application.runInBackground = true;
            var defaultBackend = Application.platform == RuntimePlatform.Android
                ? "http://10.0.2.2:8790"
                : "http://127.0.0.1:8790";
            backend = new CallBackendClient(ReadCommandLineValue("--call-backend", defaultBackend));
            displayName = PlayerPrefs.GetString(DisplayNameKey, string.Empty);
            userId = PlayerPrefs.GetString(UserIdKey, string.Empty);
            protocol = new WhipWhepProtocol(this);
            protocol.StateChanged += value => phase = value;
            protocol.RemoteVideoReceived += texture => remoteCamera = texture;
            StartCoroutine(WebRTC.Update());
        }

        private void Update()
        {
            if (string.IsNullOrWhiteSpace(userId)) return;
            if (Time.unscaledTime >= nextSessionPoll && !pollingSessions)
                _ = PollSessionsAsync();
            if (active != null && Time.unscaledTime >= nextPeerPoll && !pollingPeer
                && !playbackStarting && !playbackActive)
                _ = PollPeerAsync();
        }

        /// <summary>
        /// Lets a host game expose a Unity-rendered screen/share texture. The
        /// presentation resolver gives it priority without coupling capture to UI.
        /// Publishing a native OS desktop capture still depends on target support.
        /// </summary>
        public void SetScreenShareTexture(Texture texture, string surfaceId = "screen")
        {
            screenShare = texture;
            screenSurfaceId = string.IsNullOrWhiteSpace(surfaceId) ? "screen" : surfaceId;
            if (texture == null && focusedSurfaceId == screenSurfaceId) focusedSurfaceId = null;
        }

        private async Task PollSessionsAsync()
        {
            pollingSessions = true;
            try
            {
                sessions = (await backend.SessionsAsync(userId))
                    .OrderByDescending(item => item.updatedAt)
                    .ToArray();
                var current = active == null ? null : sessions.FirstOrDefault(item => item.id == active.id);
                if (current?.status == "ended" && !ending)
                {
                    StartCoroutine(EndCallRoutine(false, "peer_ended"));
                    return;
                }
                if (current != null) active = current;
                incoming = sessions.FirstOrDefault(item =>
                    item.targetUserId == userId && item.status == "ringing");
            }
            catch { notice = "Backend reconnecting…"; }
            finally
            {
                nextSessionPoll = Time.unscaledTime + PollInterval;
                pollingSessions = false;
            }
        }

        private async Task PollPeerAsync()
        {
            pollingPeer = true;
            try
            {
                var peer = await backend.PreparePeerAsync(active.id, userId);
                if (peer.ready && peer.playback != null)
                {
                    playbackStarting = true;
                    StartCoroutine(protocol.Play(peer.playback, error =>
                    {
                        playbackStarting = false;
                        if (error != null)
                        {
                            notice = error.Message;
                            phase = "Connection issue";
                            return;
                        }
                        playbackActive = true;
                        phase = "Live";
                    }));
                }
                else
                {
                    phase = peer.reason == "peer_media_not_active"
                        ? "Peer is connecting media…"
                        : $"Calling {active.PeerUserId(userId)}…";
                }
            }
            catch (Exception error)
            {
                notice = error.Message;
            }
            finally
            {
                nextPeerPoll = Time.unscaledTime + 1f;
                pollingPeer = false;
            }
        }

        private async void CreateCall()
        {
            if (!ValidUserId(targetUserId) || targetUserId == userId)
            {
                notice = targetUserId == userId ? "Choose another person to call." : "Enter a valid user ID.";
                return;
            }
            try
            {
                notice = string.Empty;
                phase = "Creating private call…";
                await EnterCall(await backend.CreateAsync(userId, targetUserId, displayName, callType));
            }
            catch (Exception error) { notice = error.Message; }
        }

        private async void AcceptIncoming()
        {
            if (incoming == null) return;
            try
            {
                var accepted = await backend.AcceptAsync(incoming.id, userId);
                incoming = null;
                await EnterCall(accepted);
            }
            catch (Exception error) { notice = error.Message; }
        }

        private async Task EnterCall(CallSession session)
        {
            active = session;
            remoteCamera = null;
            focusedSurfaceId = null;
            miniOffset = Vector2.zero;
            phase = session.status == "ringing" ? "Ringing…" : "Connecting securely…";
            capture = new LocalMediaCapture(gameObject);
            IReadOnlyList<MediaStreamTrack> tracks;
            try
            {
                tracks = capture.Start(session.callType != "audio");
                var prepared = await backend.PreparePublisherAsync(session.id, userId, displayName);
                StartCoroutine(protocol.Publish(prepared.publisher, tracks, error =>
                {
                    if (error != null)
                    {
                        notice = error.Message;
                        phase = "Connection issue";
                        return;
                    }
                    phase = $"Calling {active.PeerUserId(userId)}…";
                    nextPeerPoll = 0f;
                }));
            }
            catch
            {
                capture.Dispose();
                capture = null;
                active = null;
                throw;
            }
        }

        private void DeclineIncoming()
        {
            if (incoming == null) return;
            _ = EndIncomingAsync(incoming);
        }

        private async Task EndIncomingAsync(CallSession session)
        {
            try { await backend.EndAsync(session.id, userId, "declined"); }
            catch (Exception error) { notice = error.Message; }
            incoming = null;
            nextSessionPoll = 0f;
        }

        private void EndCall()
        {
            if (!ending && active != null) StartCoroutine(EndCallRoutine(true, "user_ended"));
        }

        private IEnumerator EndCallRoutine(bool notifyBackend, string reason)
        {
            ending = true;
            var endedSession = active;
            yield return protocol.Stop();
            capture?.Dispose();
            capture = null;
            remoteCamera = null;
            screenShare = null;
            active = null;
            focusedSurfaceId = null;
            playbackStarting = false;
            playbackActive = false;
            if (notifyBackend && endedSession != null)
            {
                var task = backend.EndAsync(endedSession.id, userId, reason);
                while (!task.IsCompleted) yield return null;
                if (task.IsFaulted) notice = task.Exception?.GetBaseException().Message ?? "Call cleanup failed.";
            }
            ending = false;
            phase = "Ready for calls";
            nextSessionPoll = 0f;
        }

        private void OnGUI()
        {
            EnsureStyles();
            DrawBackdrop();
            if (string.IsNullOrWhiteSpace(userId)) DrawOnboarding();
            else if (active == null) DrawHome();
            else DrawCall();
        }

        private void DrawOnboarding()
        {
            var card = CenteredCard(610, 475);
            DrawPanel(card, new Color(0.035f, 0.08f, 0.075f, 0.97f));
            GUI.Label(new Rect(card.x + 44, card.y + 38, card.width - 88, 44), "MediaSFU · Unity WHIP + WHEP", badge);
            GUI.Label(new Rect(card.x + 44, card.y + 92, card.width - 88, 74), "Calls that feel instantly familiar.", heading);
            GUI.Label(new Rect(card.x + 44, card.y + 165, card.width - 88, 58),
                "Choose a local demo identity. You call a person—not a meeting ID—and the backend creates the room invisibly.", body);
            GUI.Label(new Rect(card.x + 44, card.y + 240, 170, 28), "Display name", body);
            displayName = GUI.TextField(new Rect(card.x + 44, card.y + 270, card.width - 88, 48), displayName, 10, input);
            GUI.Label(new Rect(card.x + 44, card.y + 328, 170, 28), "Your user ID", body);
            userId = GUI.TextField(new Rect(card.x + 44, card.y + 357, card.width - 88, 48), userId, 64, input);
            if (GUI.Button(new Rect(card.x + 44, card.y + 418, card.width - 88, 48), "Continue to calls  →", button))
            {
                if (!ValidDisplayName(displayName) || !ValidUserId(userId))
                {
                    notice = "Use 2–10 alphanumeric characters for the name and 2–64 letters, numbers, _ or - for the user ID.";
                }
                else
                {
                    PlayerPrefs.SetString(DisplayNameKey, displayName);
                    PlayerPrefs.SetString(UserIdKey, userId);
                    PlayerPrefs.Save();
                    notice = string.Empty;
                    nextSessionPoll = 0f;
                }
            }
            if (!string.IsNullOrWhiteSpace(notice))
                GUI.Label(new Rect(card.x + 44, card.yMax + 12, card.width - 88, 48), notice, body);
        }

        private void DrawHome()
        {
            var margin = Mathf.Max(28f, Screen.width * .06f);
            GUI.Label(new Rect(margin, 36, Screen.width - margin * 2, 60), "Chats & calls", heading);
            GUI.Label(new Rect(margin, 94, 360, 32), "Ready for calls · WHIP/WHEP", badge);
            if (GUI.Button(new Rect(Screen.width - margin - 190, 42, 190, 44), $"{displayName}  ·  Change", button))
            {
                PlayerPrefs.DeleteKey(DisplayNameKey);
                PlayerPrefs.DeleteKey(UserIdKey);
                displayName = userId = string.Empty;
                sessions = Array.Empty<CallSession>();
                return;
            }

            var left = new Rect(margin, 150, Mathf.Min(520, Screen.width * .46f), Screen.height - 190);
            var right = new Rect(left.xMax + 24, 150, Screen.width - margin - left.xMax - 24, Screen.height - 190);
            DrawPanel(left, new Color(.05f, .12f, .11f, .96f));
            DrawPanel(right, new Color(.04f, .09f, .085f, .94f));
            GUI.Label(new Rect(left.x + 32, left.y + 28, left.width - 64, 45), "Start a call", subheading);
            GUI.Label(new Rect(left.x + 32, left.y + 79, left.width - 64, 25), "Who would you like to call?", body);
            targetUserId = GUI.TextField(new Rect(left.x + 32, left.y + 112, left.width - 64, 48), targetUserId, 64, input);
            if (GUI.Button(new Rect(left.x + 32, left.y + 176, (left.width - 76) / 2, 44), "▰  Video", callType == "video" ? button : input)) callType = "video";
            if (GUI.Button(new Rect(left.x + 44 + (left.width - 76) / 2, left.y + 176, (left.width - 76) / 2, 44), "●  Audio", callType == "audio" ? button : input)) callType = "audio";
            if (GUI.Button(new Rect(left.x + 32, left.y + 244, left.width - 64, 52), "Call now  →", button)) CreateCall();
            GUI.Label(new Rect(left.x + 32, left.y + 315, left.width - 64, 80), notice, body);

            GUI.Label(new Rect(right.x + 32, right.y + 28, right.width - 64, 45), "Recent calls", subheading);
            var y = right.y + 86;
            foreach (var session in sessions.Take(7))
            {
                var peer = session.PeerUserId(userId);
                if (GUI.Button(new Rect(right.x + 28, y, right.width - 56, 54),
                        $"{Initials(peer)}     {peer}     {session.callType} · {session.status}", input)
                    && session.status != "ended")
                {
                    incoming = session;
                    AcceptIncoming();
                }
                y += 62;
            }

            if (incoming != null)
            {
                var popup = new Rect(Screen.width / 2f - 260, Screen.height - 150, 520, 115);
                DrawPanel(popup, new Color(.02f, .2f, .15f, .99f));
                GUI.Label(new Rect(popup.x + 22, popup.y + 15, popup.width - 44, 32),
                    $"Incoming {incoming.callType} call · {incoming.displayName}", subheading);
                if (GUI.Button(new Rect(popup.x + 22, popup.y + 60, 224, 40), "Decline", dangerButton)) DeclineIncoming();
                if (GUI.Button(new Rect(popup.x + 274, popup.y + 60, 224, 40), "Accept call", button)) AcceptIncoming();
            }
        }

        private void DrawCall()
        {
            var peer = active.PeerUserId(userId);
            GUI.Label(new Rect(28, 22, 220, 32), "‹  Familiar call", badge);
            GUI.Label(new Rect(28, 57, 480, 56), peer, heading);
            GUI.Label(new Rect(28, 111, 360, 28), phase, body);
            var stage = new Rect(28, 154, Screen.width - 56, Screen.height - 280);
            DrawPanel(stage, new Color(.018f, .04f, .039f, 1f));
            var surfaces = CurrentSurfaces();
            var layout = MediaPresentationResolver.Resolve(surfaces, focusedSurfaceId);
            if (layout.Primary?.Texture != null)
            {
                DrawSurface(stage, layout.Primary);
                GUI.Label(new Rect(stage.x + 18, stage.yMax - 44, 260, 30), SurfaceLabel(layout.Primary, peer), badge);
            }
            else
            {
                GUI.Label(new Rect(stage.center.x - 100, stage.center.y - 60, 200, 80), Initials(peer), heading);
                GUI.Label(new Rect(stage.center.x - 180, stage.center.y + 20, 360, 32), phase, subheading);
            }

            var preview = layout.Previews.FirstOrDefault();
            if (preview?.Texture != null)
            {
                var previewSize = new Vector2(Mathf.Min(240, stage.width * .28f), Mathf.Min(150, stage.height * .28f));
                miniOffset = MediaPresentationResolver.ClampMiniOffset(miniOffset, stage, previewSize);
                var mini = new Rect(stage.xMax - previewSize.x - 16 + miniOffset.x, stage.y + 16 + miniOffset.y, previewSize.x, previewSize.y);
                DrawSurface(mini, preview);
                GUI.Label(new Rect(mini.x + 9, mini.yMax - 31, mini.width - 18, 24), SurfaceLabel(preview, peer), badge);
                HandleMediaGestures(stage, mini, layout.Primary, preview);
            }

            var controlsY = Screen.height - 102;
            if (GUI.Button(new Rect(Screen.width / 2f - 174, controlsY, 104, 54), capture?.MicrophoneEnabled == true ? "Mute" : "Unmute", button)) capture?.ToggleMicrophone();
            if (active.callType != "audio" && GUI.Button(new Rect(Screen.width / 2f - 54, controlsY, 108, 54), capture?.CameraEnabled == true ? "Camera off" : "Camera on", button)) capture?.ToggleCamera();
            if (GUI.Button(new Rect(Screen.width / 2f + 70, controlsY, 104, 54), "End", dangerButton)) EndCall();
            GUI.Label(new Rect(28, Screen.height - 40, Screen.width - 56, 26),
                "SDK-free · short-lived WHIP publish + WHEP playback · double-tap to swap · drag the mini view", badge);
            if (!string.IsNullOrWhiteSpace(notice))
                GUI.Label(new Rect(Screen.width - 450, 24, 420, 55), notice, body);
        }

        private List<MediaSurface> CurrentSurfaces()
        {
            var result = new List<MediaSurface>();
            if (screenShare != null) result.Add(new MediaSurface(screenSurfaceId, MediaSurfaceKind.Screen, screenShare));
            if (remoteCamera != null) result.Add(new MediaSurface("peer-camera", MediaSurfaceKind.RemoteCamera, remoteCamera));
            if (capture?.CameraTexture != null) result.Add(new MediaSurface("self-camera", MediaSurfaceKind.LocalCamera, capture.CameraTexture));
            return result;
        }

        private void HandleMediaGestures(Rect stage, Rect mini, MediaSurface primary, MediaSurface preview)
        {
            var current = Event.current;
            if (current.type == EventType.MouseDown && mini.Contains(current.mousePosition))
            {
                draggingMini = true;
                pointerOrigin = current.mousePosition;
                dragOrigin = miniOffset;
                current.Use();
            }
            else if (current.type == EventType.MouseDrag && draggingMini)
            {
                miniOffset = MediaPresentationResolver.ClampMiniOffset(
                    dragOrigin + current.mousePosition - pointerOrigin,
                    stage,
                    new Vector2(mini.width, mini.height));
                current.Use();
            }
            else if (current.type == EventType.MouseUp)
            {
                var moved = Vector2.Distance(pointerOrigin, current.mousePosition);
                var inMini = mini.Contains(current.mousePosition);
                if ((inMini || stage.Contains(current.mousePosition))
                    && current.clickCount >= 2 && (!inMini || moved < 10f)
                    && primary.Kind != MediaSurfaceKind.Screen)
                    focusedSurfaceId = focusedSurfaceId == preview.Id ? primary.Id : preview.Id;
                draggingMini = false;
            }
        }

        private void DrawSurface(Rect rect, MediaSurface surface)
        {
            GUI.BeginGroup(rect);
            var target = new Rect(0, 0, rect.width, rect.height);
            var uv = surface.Kind == MediaSurfaceKind.LocalCamera
                ? new Rect(1, 0, -1, 1)
                : new Rect(0, 0, 1, 1);
            GUI.DrawTextureWithTexCoords(target, surface.Texture, uv, true);
            GUI.EndGroup();
        }

        private static string SurfaceLabel(MediaSurface surface, string peer) => surface.Kind switch
        {
            MediaSurfaceKind.Screen => "Screen share",
            MediaSurfaceKind.LocalCamera => "You",
            _ => peer
        };

        private void DrawBackdrop()
        {
            GUI.color = new Color(.02f, .055f, .05f, 1f);
            GUI.DrawTexture(new Rect(0, 0, Screen.width, Screen.height), white);
            GUI.color = Color.white;
        }

        private static Rect CenteredCard(float width, float height) =>
            new Rect((Screen.width - width) / 2f, (Screen.height - height) / 2f, width, height);

        private void DrawPanel(Rect rect, Color color)
        {
            GUI.color = color;
            GUI.DrawTexture(rect, white);
            GUI.color = Color.white;
        }

        private void EnsureStyles()
        {
            if (heading != null) return;
            white = new Texture2D(1, 1);
            white.SetPixel(0, 0, Color.white);
            white.Apply();
            heading = new GUIStyle(GUI.skin.label) { fontSize = 34, fontStyle = FontStyle.Bold, wordWrap = true, normal = { textColor = Color.white } };
            subheading = new GUIStyle(heading) { fontSize = 23 };
            body = new GUIStyle(GUI.skin.label) { fontSize = 16, wordWrap = true, normal = { textColor = new Color(.76f, .86f, .83f) } };
            badge = new GUIStyle(body) { fontSize = 14, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleLeft };
            input = new GUIStyle(GUI.skin.button) { fontSize = 16, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(16, 16, 8, 8), normal = { textColor = Color.white } };
            button = new GUIStyle(GUI.skin.button) { fontSize = 16, fontStyle = FontStyle.Bold, normal = { textColor = Color.white } };
            dangerButton = new GUIStyle(button);
        }

        private static bool ValidDisplayName(string value) =>
            !string.IsNullOrWhiteSpace(value) && value.Length >= 2 && value.Length <= 10 && value.All(char.IsLetterOrDigit);

        private static bool ValidUserId(string value) =>
            !string.IsNullOrWhiteSpace(value) && value.Length >= 2 && value.Length <= 64
            && value.All(character => char.IsLetterOrDigit(character) || character == '_' || character == '-');

        private static string Initials(string value) =>
            string.IsNullOrWhiteSpace(value) ? "??" : value.Substring(0, Math.Min(2, value.Length)).ToUpperInvariant();

        private static string ReadCommandLineValue(string key, string fallback)
        {
            var arguments = Environment.GetCommandLineArgs();
            var index = Array.IndexOf(arguments, key);
            return index >= 0 && index + 1 < arguments.Length ? arguments[index + 1] : fallback;
        }

        private void OnApplicationQuit()
        {
            capture?.Dispose();
            protocol?.Dispose();
        }
    }
}
