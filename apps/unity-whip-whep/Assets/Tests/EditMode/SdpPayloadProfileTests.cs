using MediaSFU.FamiliarCall.Media;
using NUnit.Framework;

namespace MediaSFU.FamiliarCall.Tests
{
    public sealed class SdpPayloadProfileTests
    {
        [Test]
        public void AlignRemapsMediaLineAndCodecAttributes()
        {
            const string offer =
                "v=0\r\n" +
                "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" +
                "a=rtpmap:111 opus/48000/2\r\n" +
                "m=video 9 UDP/TLS/RTP/SAVPF 96 97\r\n" +
                "a=rtpmap:96 VP8/90000\r\n" +
                "a=rtpmap:97 rtx/90000\r\n" +
                "a=fmtp:97 apt=96\r\n";

            var aligned = SdpPayloadProfile.Align(offer, "audio/opus=109,video/vp8=120");

            StringAssert.Contains("m=audio 9 UDP/TLS/RTP/SAVPF 109", aligned);
            StringAssert.Contains("a=rtpmap:109 opus/48000/2", aligned);
            StringAssert.Contains("m=video 9 UDP/TLS/RTP/SAVPF 120 97", aligned);
            StringAssert.Contains("a=fmtp:97 apt=120", aligned);
        }

        [Test]
        public void AlignRejectsMissingProfile()
        {
            Assert.Throws<System.InvalidOperationException>(() => SdpPayloadProfile.Align("v=0\r\n", ""));
        }

        [Test]
        public void AlignPrefersPacketizedBaselineH264()
        {
            const string offer =
                "v=0\r\n" +
                "m=video 9 UDP/TLS/RTP/SAVPF 100 101\r\n" +
                "a=rtpmap:100 H264/90000\r\n" +
                "a=fmtp:100 packetization-mode=0;profile-level-id=42001f\r\n" +
                "a=rtpmap:101 H264/90000\r\n" +
                "a=fmtp:101 packetization-mode=1;profile-level-id=42e01f\r\n";

            var aligned = SdpPayloadProfile.Align(offer, "video/h264=126");

            StringAssert.Contains("a=rtpmap:100 H264/90000", aligned);
            StringAssert.Contains("a=rtpmap:126 H264/90000", aligned);
            StringAssert.Contains("a=fmtp:126 packetization-mode=1", aligned);
        }
    }
}
