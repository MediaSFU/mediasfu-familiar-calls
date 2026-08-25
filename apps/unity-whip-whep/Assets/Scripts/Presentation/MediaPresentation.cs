using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace MediaSFU.FamiliarCall.Presentation
{
    public enum MediaSurfaceKind { Screen, RemoteCamera, LocalCamera }

    public sealed class MediaSurface
    {
        public MediaSurface(string id, MediaSurfaceKind kind, Texture texture, bool placeholder = false)
        {
            Id = id;
            Kind = kind;
            Texture = texture;
            IsPlaceholder = placeholder;
        }

        public string Id { get; }
        public MediaSurfaceKind Kind { get; }
        public Texture Texture { get; }
        public bool IsPlaceholder { get; }
    }

    public sealed class MediaLayout
    {
        public MediaLayout(MediaSurface primary, IReadOnlyList<MediaSurface> previews)
        {
            Primary = primary;
            Previews = previews;
        }

        public MediaSurface Primary { get; }
        public IReadOnlyList<MediaSurface> Previews { get; }
    }

    /// <summary>
    /// Pure media-selection policy. It knows nothing about WHIP, WHEP, Unity UI,
    /// or backend sessions, so protocol and rendering can evolve independently.
    /// </summary>
    public static class MediaPresentationResolver
    {
        public static MediaLayout Resolve(
            IEnumerable<MediaSurface> surfaces,
            string focusedSurfaceId = null)
        {
            var visible = (surfaces ?? Array.Empty<MediaSurface>())
                .Where(surface => surface != null && !surface.IsPlaceholder && surface.Texture != null)
                .ToList();
            // An active screen share is authoritative. A remembered camera focus
            // may resume only after the share disappears.
            var primary = visible.FirstOrDefault(surface => surface.Kind == MediaSurfaceKind.Screen)
                ?? visible.FirstOrDefault(surface => surface.Id == focusedSurfaceId)
                ?? visible.FirstOrDefault(surface => surface.Kind == MediaSurfaceKind.RemoteCamera)
                ?? visible.FirstOrDefault(surface => surface.Kind == MediaSurfaceKind.LocalCamera);
            var previews = primary == null
                ? Array.Empty<MediaSurface>()
                : visible.Where(surface => !ReferenceEquals(surface, primary)).ToArray();
            return new MediaLayout(primary, previews);
        }

        public static Vector2 ClampMiniOffset(
            Vector2 requestedOffset,
            Rect stage,
            Vector2 previewSize,
            float gap = 16f)
        {
            var baseLeft = Mathf.Max(stage.width - previewSize.x - gap, 0f);
            return new Vector2(
                Mathf.Clamp(requestedOffset.x, -baseLeft, gap),
                Mathf.Clamp(
                    requestedOffset.y,
                    -gap,
                    Mathf.Max(stage.height - previewSize.y - gap, -gap)));
        }
    }
}
