using System;

namespace MediaSFU.FamiliarCall.Backend
{
    [Serializable]
    public sealed class CallSession
    {
        public string id;
        public string hostUserId;
        public string targetUserId;
        public string displayName;
        public string callType;
        public string status;
        public string createdAt;
        public string updatedAt;

        public string PeerUserId(string currentUserId) =>
            string.Equals(hostUserId, currentUserId, StringComparison.Ordinal) ? targetUserId : hostUserId;
    }

    [Serializable]
    public sealed class ProtocolResource
    {
        public string url;
        public string token;
        public string[] tracks;
    }

    [Serializable]
    public sealed class PublisherPreparation
    {
        public ProtocolResource publisher;
        public bool peerReady;
    }

    [Serializable]
    public sealed class PeerPreparation
    {
        public bool ready;
        public string reason;
        public ProtocolResource playback;
    }

    [Serializable]
    internal sealed class SessionsEnvelope { public bool success; public string error; public CallSession[] data; }
    [Serializable]
    internal sealed class CreateEnvelope { public bool success; public string error; public CallSession session; }
    [Serializable]
    internal sealed class SessionEnvelope { public bool success; public string error; public CallSession data; }
    [Serializable]
    internal sealed class PublisherEnvelope { public bool success; public string error; public PublisherPreparation data; }
    [Serializable]
    internal sealed class PeerEnvelope { public bool success; public string error; public PeerPreparation data; }
    [Serializable]
    internal sealed class BasicEnvelope { public bool success; public string error; }

    [Serializable]
    internal sealed class CreateCallBody
    {
        public string hostUserId;
        public string targetUserId;
        public string displayName;
        public int duration = 30;
        public int capacity = 2;
        public string eventType = "conference";
        public string callType;
    }

    [Serializable]
    internal sealed class AcceptCallBody { public string sessionId; public string userId; }
    [Serializable]
    internal sealed class PrepareBody { public string sessionId; public string userId; public string displayName; }
    [Serializable]
    internal sealed class EndBody { public string userId; public string reason; }
}
