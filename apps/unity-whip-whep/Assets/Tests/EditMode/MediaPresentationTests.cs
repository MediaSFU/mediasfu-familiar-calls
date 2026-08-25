using System.Collections.Generic;
using MediaSFU.FamiliarCall.Presentation;
using NUnit.Framework;
using UnityEngine;

namespace MediaSFU.FamiliarCall.Tests
{
    public sealed class MediaPresentationTests
    {
        private Texture2D remote;
        private Texture2D local;
        private Texture2D screen;

        [SetUp]
        public void SetUp()
        {
            remote = new Texture2D(4, 4);
            local = new Texture2D(4, 4);
            screen = new Texture2D(4, 4);
        }

        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(remote);
            Object.DestroyImmediate(local);
            Object.DestroyImmediate(screen);
        }

        [Test]
        public void RemoteCameraIsPrimaryAndLocalCameraIsPreview()
        {
            var layout = MediaPresentationResolver.Resolve(new[]
            {
                new MediaSurface("self", MediaSurfaceKind.LocalCamera, local),
                new MediaSurface("peer", MediaSurfaceKind.RemoteCamera, remote)
            });

            Assert.That(layout.Primary.Id, Is.EqualTo("peer"));
            Assert.That(layout.Previews[0].Id, Is.EqualTo("self"));
        }

        [Test]
        public void ScreenAlwaysHasPriorityOverRememberedCameraFocus()
        {
            var surfaces = new List<MediaSurface>
            {
                new MediaSurface("peer", MediaSurfaceKind.RemoteCamera, remote),
                new MediaSurface("share", MediaSurfaceKind.Screen, screen)
            };

            Assert.That(MediaPresentationResolver.Resolve(surfaces).Primary.Id, Is.EqualTo("share"));
            Assert.That(MediaPresentationResolver.Resolve(surfaces, "peer").Primary.Id, Is.EqualTo("share"));
        }

        [Test]
        public void PlaceholderAndMissingTexturesAreNeverPresented()
        {
            var layout = MediaPresentationResolver.Resolve(new[]
            {
                new MediaSurface("placeholder", MediaSurfaceKind.RemoteCamera, remote, true),
                new MediaSurface("missing", MediaSurfaceKind.Screen, null),
                new MediaSurface("self", MediaSurfaceKind.LocalCamera, local)
            });

            Assert.That(layout.Primary.Id, Is.EqualTo("self"));
            Assert.That(layout.Previews, Is.Empty);
        }

        [Test]
        public void MiniPreviewIsClampedInsideStage()
        {
            var offset = MediaPresentationResolver.ClampMiniOffset(
                new Vector2(-900f, 900f), new Rect(0, 0, 600, 400), new Vector2(180, 120));

            Assert.That(offset.x, Is.EqualTo(-404f));
            Assert.That(offset.y, Is.EqualTo(264f));
        }
    }
}
