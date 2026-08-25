using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using MediaSFU.FamiliarCall.Backend;
using Unity.WebRTC;
using UnityEngine;
using UnityEngine.Networking;

namespace MediaSFU.FamiliarCall.Media
{
    /// <summary>
    /// SDK-free WebRTC-over-HTTP transport. It deliberately has no knowledge of
    /// contacts, rooms, call UI, or presentation priority.
    /// </summary>
    public sealed class WhipWhepProtocol : IDisposable
    {
        public const string WhepPayloadProfileHeader = "x-mediasfu-rtp-payload-types";

        private readonly MonoBehaviour coroutineOwner;
        private readonly List<MediaStreamTrack> localTracks = new();
        private readonly List<MediaStreamTrack> remoteTracks = new();
        private readonly List<AudioSource> remoteAudioSources = new();
        private RTCPeerConnection publisherPeer;
        private RTCPeerConnection playbackPeer;
        private string publisherResourceUrl;
        private string playbackResourceUrl;
        private string publisherToken;
        private string playbackToken;
        private bool disposed;

        public WhipWhepProtocol(MonoBehaviour coroutineOwner)
        {
            this.coroutineOwner = coroutineOwner;
        }

        public event Action<Texture> RemoteVideoReceived;
        public event Action<string> StateChanged;

        public IEnumerator Publish(
            ProtocolResource lease,
            IEnumerable<MediaStreamTrack> tracks,
            Action<Exception> completed)
        {
            Exception failure = null;
            yield return RunGuarded(PublishInternal(lease, tracks), error => failure = error);
            completed?.Invoke(failure);
        }

        public IEnumerator Play(ProtocolResource lease, Action<Exception> completed)
        {
            Exception failure = null;
            yield return RunGuarded(PlayInternal(lease), error => failure = error);
            completed?.Invoke(failure);
        }

        public IEnumerator Stop()
        {
            var playbackUrl = playbackResourceUrl;
            var playbackBearer = playbackToken;
            var publisherUrl = publisherResourceUrl;
            var publisherBearer = publisherToken;
            ClosePeersAndTracks();
            if (!string.IsNullOrWhiteSpace(playbackUrl))
                yield return DeleteResource(playbackUrl, playbackBearer);
            if (!string.IsNullOrWhiteSpace(publisherUrl))
                yield return DeleteResource(publisherUrl, publisherBearer);
        }

        public void SetMicrophoneEnabled(bool enabled)
        {
            foreach (var track in localTracks.OfType<AudioStreamTrack>()) track.Enabled = enabled;
        }

        public void SetCameraEnabled(bool enabled)
        {
            foreach (var track in localTracks.OfType<VideoStreamTrack>()) track.Enabled = enabled;
        }

        private IEnumerator PublishInternal(ProtocolResource lease, IEnumerable<MediaStreamTrack> tracks)
        {
            ValidateLease(lease, "WHIP");
            publisherPeer = new RTCPeerConnection();
            foreach (var track in tracks ?? Array.Empty<MediaStreamTrack>())
            {
                if (track == null) continue;
                localTracks.Add(track);
                publisherPeer.AddTrack(track);
            }
            if (localTracks.Count == 0) throw new InvalidOperationException("WHIP requires captured media.");

            StateChanged?.Invoke("Creating WHIP offer");
            var offer = publisherPeer.CreateOffer();
            yield return offer;
            if (offer.IsError) throw new InvalidOperationException(offer.Error.message);
            var local = offer.Desc;
            var setLocal = publisherPeer.SetLocalDescription(ref local);
            yield return setLocal;
            if (setLocal.IsError) throw new InvalidOperationException(setLocal.Error.message);
            yield return WaitForIce(publisherPeer);

            var request = SdpRequest("POST", lease.url, lease.token, publisherPeer.LocalDescription.sdp);
            yield return request.SendWebRequest();
            using (request)
            {
                EnsureProtocolSuccess(request, 201, "WHIP publish");
                publisherResourceUrl = ResolveLocation(lease.url, request.GetResponseHeader("Location"));
                publisherToken = lease.token;
                var answer = new RTCSessionDescription
                {
                    type = RTCSdpType.Answer,
                    sdp = request.downloadHandler.text
                };
                var setRemote = publisherPeer.SetRemoteDescription(ref answer);
                yield return setRemote;
                if (setRemote.IsError) throw new InvalidOperationException(setRemote.Error.message);
            }
            StateChanged?.Invoke("WHIP publishing");
        }

        private IEnumerator PlayInternal(ProtocolResource lease)
        {
            ValidateLease(lease, "WHEP");
            playbackPeer = new RTCPeerConnection();
            playbackPeer.OnTrack = HandleRemoteTrack;
            var recvOnly = new RTCRtpTransceiverInit { direction = RTCRtpTransceiverDirection.RecvOnly };
            foreach (var kind in lease.tracks ?? Array.Empty<string>())
            {
                if (string.Equals(kind, "audio", StringComparison.OrdinalIgnoreCase))
                    playbackPeer.AddTransceiver(TrackKind.Audio, recvOnly);
                if (string.Equals(kind, "video", StringComparison.OrdinalIgnoreCase))
                    playbackPeer.AddTransceiver(TrackKind.Video, recvOnly);
            }

            StateChanged?.Invoke("Reading WHEP codec profile");
            string profileHeader;
            using (var profile = UnityWebRequest.Get(lease.url))
            {
                yield return profile.SendWebRequest();
                if (profile.result != UnityWebRequest.Result.Success)
                    throw new InvalidOperationException($"WHEP profile request failed ({profile.responseCode}).");
                profileHeader = profile.GetResponseHeader(WhepPayloadProfileHeader);
            }

            var offer = playbackPeer.CreateOffer();
            yield return offer;
            if (offer.IsError) throw new InvalidOperationException(offer.Error.message);
            var alignedSdp = SdpPayloadProfile.Align(offer.Desc.sdp, profileHeader);
            var local = new RTCSessionDescription { type = RTCSdpType.Offer, sdp = alignedSdp };
            var setLocal = playbackPeer.SetLocalDescription(ref local);
            yield return setLocal;
            if (setLocal.IsError) throw new InvalidOperationException(setLocal.Error.message);
            yield return WaitForIce(playbackPeer);

            var request = SdpRequest("POST", lease.url, lease.token, playbackPeer.LocalDescription.sdp);
            yield return request.SendWebRequest();
            using (request)
            {
                EnsureProtocolSuccess(request, 201, "WHEP playback");
                playbackResourceUrl = ResolveLocation(lease.url, request.GetResponseHeader("Location"));
                playbackToken = lease.token;
                var answer = new RTCSessionDescription
                {
                    type = RTCSdpType.Answer,
                    sdp = request.downloadHandler.text
                };
                var setRemote = playbackPeer.SetRemoteDescription(ref answer);
                yield return setRemote;
                if (setRemote.IsError) throw new InvalidOperationException(setRemote.Error.message);
            }
            StateChanged?.Invoke("WHEP playing");
        }

        private void HandleRemoteTrack(RTCTrackEvent trackEvent)
        {
            var track = trackEvent.Track;
            if (track == null || remoteTracks.Contains(track)) return;
            remoteTracks.Add(track);
            if (track is VideoStreamTrack video)
                video.OnVideoReceived += texture => RemoteVideoReceived?.Invoke(texture);
            if (track is AudioStreamTrack audio)
            {
                // Every remote audio track gets its own output source. Never gate
                // playback on which participant or video surface is visible.
                var output = new GameObject($"Remote audio {remoteAudioSources.Count + 1}");
                output.transform.SetParent(coroutineOwner.transform, false);
                var source = output.AddComponent<AudioSource>();
                source.playOnAwake = true;
                source.SetTrack(audio);
                source.Play();
                remoteAudioSources.Add(source);
            }
        }

        private static IEnumerator WaitForIce(RTCPeerConnection peer)
        {
            var started = Time.realtimeSinceStartup;
            while (peer.GatheringState != RTCIceGatheringState.Complete)
            {
                if (Time.realtimeSinceStartup - started > 12f)
                    throw new TimeoutException("WebRTC ICE gathering timed out.");
                yield return null;
            }
        }

        private static UnityWebRequest SdpRequest(string method, string url, string token, string sdp)
        {
            var request = new UnityWebRequest(url, method)
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(sdp ?? string.Empty)),
                downloadHandler = new DownloadHandlerBuffer()
            };
            request.SetRequestHeader("Authorization", $"Bearer {token}");
            request.SetRequestHeader("Content-Type", "application/sdp");
            return request;
        }

        private static IEnumerator DeleteResource(string url, string token)
        {
            using var request = UnityWebRequest.Delete(url);
            request.SetRequestHeader("Authorization", $"Bearer {token}");
            yield return request.SendWebRequest();
        }

        private static string ResolveLocation(string endpoint, string location)
        {
            if (string.IsNullOrWhiteSpace(location))
                throw new InvalidOperationException("Protocol response omitted its resource URL.");
            return new Uri(new Uri(endpoint), location).AbsoluteUri;
        }

        private static void EnsureProtocolSuccess(UnityWebRequest request, long expected, string operation)
        {
            if (request.responseCode != expected)
                throw new InvalidOperationException($"{operation} was refused ({request.responseCode}).");
        }

        private static void ValidateLease(ProtocolResource lease, string protocol)
        {
            if (lease == null || !Uri.TryCreate(lease.url, UriKind.Absolute, out var url)
                || url.Scheme != Uri.UriSchemeHttps || string.IsNullOrWhiteSpace(lease.token))
                throw new InvalidOperationException($"{protocol} lease is incomplete or insecure.");
        }

        private static IEnumerator RunGuarded(IEnumerator operation, Action<Exception> failed)
        {
            var stack = new Stack<IEnumerator>();
            stack.Push(operation);
            while (stack.Count > 0)
            {
                object current;
                try
                {
                    var active = stack.Peek();
                    if (!active.MoveNext())
                    {
                        stack.Pop();
                        continue;
                    }
                    current = active.Current;
                }
                catch (Exception error)
                {
                    failed(error);
                    yield break;
                }
                if (current is IEnumerator nested)
                {
                    stack.Push(nested);
                    continue;
                }
                yield return current;
            }
        }

        private void ClosePeersAndTracks()
        {
            playbackPeer?.Dispose();
            publisherPeer?.Dispose();
            playbackPeer = null;
            publisherPeer = null;
            foreach (var track in localTracks) track?.Dispose();
            remoteTracks.Clear();
            localTracks.Clear();
            foreach (var source in remoteAudioSources)
                if (source != null) UnityEngine.Object.Destroy(source.gameObject);
            remoteAudioSources.Clear();
            publisherResourceUrl = playbackResourceUrl = null;
            publisherToken = playbackToken = null;
        }

        public void Dispose()
        {
            if (disposed) return;
            disposed = true;
            ClosePeersAndTracks();
        }
    }

    /// <summary>Aligns WHEP offers to the server-advertised RTP payload map.</summary>
    public static class SdpPayloadProfile
    {
        private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase)
        {
            "audio/opus", "audio/pcmu", "audio/pcma", "video/vp8", "video/vp9", "video/h264"
        };

        public static string Align(string sdp, string header)
        {
            var profile = Parse(header);
            if (profile.Count == 0)
                throw new InvalidOperationException("The WHEP endpoint omitted its RTP payload profile.");
            return Regex.Replace(sdp ?? string.Empty, @"(?ms)(^m=(?:audio|video)\s.*?)(?=^m=|\z)", match =>
            {
                var section = match.Value;
                var kind = Regex.Match(section, @"^m=(audio|video)\s", RegexOptions.Multiline).Groups[1].Value;
                foreach (var entry in profile)
                    if (Supported.Contains(entry.Key) && entry.Key.StartsWith(kind + "/", StringComparison.OrdinalIgnoreCase))
                        section = Remap(section, entry.Key, entry.Value);
                return section;
            });
        }

        public static IReadOnlyDictionary<string, int> Parse(string header)
        {
            var result = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            foreach (var raw in (header ?? string.Empty).Split(','))
            {
                var pair = raw.Trim().Split('=');
                if (pair.Length == 2 && int.TryParse(pair[1], out var payloadType))
                    result[pair[0].ToLowerInvariant()] = payloadType;
            }
            return result;
        }

        private static string Remap(string section, string mimeType, int target)
        {
            var codec = mimeType.Split('/')[1];
            var mappings = Regex.Matches(section, @"^a=rtpmap:(\d+)\s+([^/\s]+)/\d+(?:/\d+)?\s*$", RegexOptions.Multiline);
            var sources = new List<int>();
            foreach (Match mapping in mappings)
            {
                var mappedPayload = int.Parse(mapping.Groups[1].Value);
                var mappedCodec = mapping.Groups[2].Value;
                if (mappedPayload == target)
                {
                    if (string.Equals(mappedCodec, codec, StringComparison.OrdinalIgnoreCase)) return section;
                    throw new InvalidOperationException($"WHEP payload type {target} is already assigned.");
                }
                if (string.Equals(mappedCodec, codec, StringComparison.OrdinalIgnoreCase)) sources.Add(mappedPayload);
            }
            var source = mimeType.Equals("video/h264", StringComparison.OrdinalIgnoreCase)
                ? PreferredH264Payload(section, sources)
                : (sources.Count > 0 ? sources[0] : -1);
            if (source < 0 || source == target) return section;
            section = Regex.Replace(section, @"^m=([^\r\n]+)$", match =>
            {
                var fields = Regex.Split(match.Value, @"\s+");
                for (var index = 0; index < fields.Length; index++)
                    if (fields[index] == source.ToString()) fields[index] = target.ToString();
                return string.Join(" ", fields);
            }, RegexOptions.Multiline);
            section = Regex.Replace(
                section,
                $@"^(a=(?:rtpmap|fmtp|rtcp-fb):){source}(?=[ \r]|$)",
                $"$1{target}",
                RegexOptions.Multiline);
            return Regex.Replace(section, $@"(\bapt=){source}(?=;|\s|$)", $"$1{target}");
        }

        private static int PreferredH264Payload(string section, IEnumerable<int> sources)
        {
            var sourceList = sources.ToList();
            var packetized = sourceList.Where(payload =>
                Regex.IsMatch(Fmtp(section, payload), @"(?:^|;)packetization-mode=1(?:;|$)", RegexOptions.IgnoreCase))
                .ToList();
            var baseline = packetized.FirstOrDefault(payload =>
                Regex.IsMatch(Fmtp(section, payload), @"profile-level-id=42e", RegexOptions.IgnoreCase));
            if (baseline != 0) return baseline;
            if (packetized.Count > 0) return packetized[0];
            return sourceList.Count > 0 ? sourceList[0] : -1;
        }

        private static string Fmtp(string section, int payload) =>
            Regex.Match(section, $@"^a=fmtp:{payload}\s+([^\r\n]+)$", RegexOptions.Multiline).Groups[1].Value;
    }
}
