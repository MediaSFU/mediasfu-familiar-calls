using System;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace MediaSFU.FamiliarCall.Backend
{
    /// <summary>
    /// Calls the shared familiar-call backend. Account credentials never enter
    /// this client; it receives only participant-scoped, short-lived leases.
    /// </summary>
    public sealed class CallBackendClient
    {
        private readonly string baseUrl;

        public CallBackendClient(string backendBaseUrl)
        {
            baseUrl = (backendBaseUrl ?? string.Empty).TrimEnd('/');
        }

        public async Task<CallSession[]> SessionsAsync(string userId)
        {
            var json = await SendAsync("GET", $"/api/users/{Escape(userId)}/sessions");
            var envelope = JsonUtility.FromJson<SessionsEnvelope>(json);
            Ensure(envelope != null && envelope.success, envelope?.error);
            return envelope.data ?? Array.Empty<CallSession>();
        }

        public async Task<CallSession> CreateAsync(
            string hostUserId, string targetUserId, string displayName, string callType)
        {
            var body = new CreateCallBody
            {
                hostUserId = hostUserId,
                targetUserId = targetUserId,
                displayName = displayName,
                callType = callType == "audio" ? "audio" : "video"
            };
            var json = await SendAsync("POST", "/api/protocol/calls/create", JsonUtility.ToJson(body));
            var envelope = JsonUtility.FromJson<CreateEnvelope>(json);
            Ensure(envelope != null && envelope.success && envelope.session != null, envelope?.error);
            return envelope.session;
        }

        public async Task<CallSession> AcceptAsync(string sessionId, string userId)
        {
            var body = new AcceptCallBody { sessionId = sessionId, userId = userId };
            var json = await SendAsync("POST", "/api/protocol/calls/accept", JsonUtility.ToJson(body));
            var envelope = JsonUtility.FromJson<SessionEnvelope>(json);
            Ensure(envelope != null && envelope.success && envelope.data != null, envelope?.error);
            return envelope.data;
        }

        public async Task<PublisherPreparation> PreparePublisherAsync(
            string sessionId, string userId, string displayName)
        {
            var body = new PrepareBody { sessionId = sessionId, userId = userId, displayName = displayName };
            var json = await SendAsync("POST", "/api/protocol/prepare", JsonUtility.ToJson(body));
            var envelope = JsonUtility.FromJson<PublisherEnvelope>(json);
            Ensure(envelope != null && envelope.success && envelope.data?.publisher != null, envelope?.error);
            return envelope.data;
        }

        public async Task<PeerPreparation> PreparePeerAsync(string sessionId, string userId)
        {
            var path = $"/api/protocol/sessions/{Escape(sessionId)}/peer?userId={Escape(userId)}";
            var json = await SendAsync("GET", path, null, true);
            var envelope = JsonUtility.FromJson<PeerEnvelope>(json);
            Ensure(envelope != null && envelope.success && envelope.data != null, envelope?.error);
            return envelope.data;
        }

        public async Task EndAsync(string sessionId, string userId, string reason)
        {
            var body = new EndBody { userId = userId, reason = reason };
            var json = await SendAsync(
                "POST", $"/api/sessions/{Escape(sessionId)}/end", JsonUtility.ToJson(body));
            var envelope = JsonUtility.FromJson<BasicEnvelope>(json);
            Ensure(envelope != null && envelope.success, envelope?.error);
        }

        private async Task<string> SendAsync(
            string method, string path, string json = null, bool acceptPending = false)
        {
            using var request = new UnityWebRequest(baseUrl + path, method);
            request.downloadHandler = new DownloadHandlerBuffer();
            request.SetRequestHeader("Accept", "application/json");
            if (json != null)
            {
                request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json));
                request.SetRequestHeader("Content-Type", "application/json");
            }

            await request.SendAsync();
            var pending = acceptPending && request.responseCode == 202;
            if (request.result != UnityWebRequest.Result.Success && !pending)
            {
                var message = ParseError(request.downloadHandler?.text);
                throw new InvalidOperationException(
                    string.IsNullOrWhiteSpace(message)
                        ? $"Backend request failed ({request.responseCode})."
                        : message);
            }
            return request.downloadHandler?.text ?? "{}";
        }

        private static string ParseError(string json)
        {
            try { return JsonUtility.FromJson<BasicEnvelope>(json)?.error; }
            catch { return string.Empty; }
        }

        private static string Escape(string value) => UnityWebRequest.EscapeURL(value ?? string.Empty);

        private static void Ensure(bool condition, string error)
        {
            if (!condition) throw new InvalidOperationException(
                string.IsNullOrWhiteSpace(error) ? "The call backend returned an incomplete response." : error);
        }
    }

    internal static class UnityWebRequestAwaiter
    {
        public static Task SendAsync(this UnityWebRequest request)
        {
            var operation = request.SendWebRequest();
            if (operation.isDone) return Task.CompletedTask;
            var completion = new TaskCompletionSource<bool>();
            operation.completed += _ => completion.TrySetResult(true);
            return completion.Task;
        }
    }
}
