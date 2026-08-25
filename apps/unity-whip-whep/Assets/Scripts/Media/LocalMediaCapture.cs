using System;
using System.Collections.Generic;
using System.Linq;
using Unity.WebRTC;
using UnityEngine;

namespace MediaSFU.FamiliarCall.Media
{
    public sealed class LocalMediaCapture : IDisposable
    {
        private readonly GameObject owner;
        private WebCamTexture cameraTexture;
        private AudioSource microphoneSource;
        private AudioClip microphoneClip;
        private AudioStreamTrack audioTrack;
        private VideoStreamTrack videoTrack;

        public LocalMediaCapture(GameObject owner)
        {
            this.owner = owner;
        }

        public Texture CameraTexture => cameraTexture;
        public bool MicrophoneEnabled => audioTrack?.Enabled ?? false;
        public bool CameraEnabled => videoTrack?.Enabled ?? false;

        public IReadOnlyList<MediaStreamTrack> Start(bool includeVideo)
        {
            var tracks = new List<MediaStreamTrack>();
            if (Microphone.devices.Length == 0)
                throw new InvalidOperationException("No microphone is available.");
            microphoneClip = Microphone.Start(Microphone.devices[0], true, 1, 48000);
            microphoneSource = owner.AddComponent<AudioSource>();
            microphoneSource.clip = microphoneClip;
            microphoneSource.loop = true;
            microphoneSource.playOnAwake = false;
            microphoneSource.volume = 0f;
            microphoneSource.Play();
            audioTrack = new AudioStreamTrack(microphoneSource) { Loopback = false };
            tracks.Add(audioTrack);

            if (includeVideo)
            {
                var device = WebCamTexture.devices.FirstOrDefault();
                if (string.IsNullOrWhiteSpace(device.name))
                    throw new InvalidOperationException("No camera is available.");
                cameraTexture = new WebCamTexture(device.name, 1280, 720, 30);
                cameraTexture.Play();
                videoTrack = new VideoStreamTrack(cameraTexture);
                tracks.Add(videoTrack);
            }
            return tracks;
        }

        public bool ToggleMicrophone()
        {
            if (audioTrack == null) return false;
            audioTrack.Enabled = !audioTrack.Enabled;
            return audioTrack.Enabled;
        }

        public bool ToggleCamera()
        {
            if (videoTrack == null) return false;
            videoTrack.Enabled = !videoTrack.Enabled;
            return videoTrack.Enabled;
        }

        public void Dispose()
        {
            if (cameraTexture != null && cameraTexture.isPlaying) cameraTexture.Stop();
            if (Microphone.IsRecording(null)) Microphone.End(null);
            if (microphoneSource != null) UnityEngine.Object.Destroy(microphoneSource);
            // Tracks are owned and disposed by WhipWhepProtocol after publish.
            cameraTexture = null;
            microphoneSource = null;
            microphoneClip = null;
            audioTrack = null;
            videoTrack = null;
        }
    }
}
