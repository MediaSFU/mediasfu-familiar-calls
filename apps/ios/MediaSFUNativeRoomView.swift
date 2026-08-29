import Foundation
import SwiftUI
import UIKit

#if canImport(MediaSFUAppleSDK)
  import MediaSFUAppleSDK
#elseif canImport(MediaSFUSDK)
  import MediaSFUSDK
  #if canImport(MediaSFUIosBridge)
    import MediaSFUIosBridge
  #endif
#endif
#if canImport(MediaSFUMediasoupClient)
  import MediaSFUMediasoupClient
#endif
#if canImport(WebRTC)
  import WebRTC
#endif

/// Configuration used to launch the shared MediaSFU room UI.
struct MediaSFURoomConfiguration {
  var userName: String
  var roomName: String = ""
  /// Optional room-scoped handoff returned by the app's backend create/join call.
  var roomApiToken: String = ""
  var roomLink: String = ""
  var islevel: String = "0"
  var adminPasscode: String = ""
  var action: String
  var eventType: String = "conference"
  var connectMediaSFU: Bool = true
}

@MainActor
final class MediaSFURoomController: ObservableObject {
  @Published private(set) var state = "Preparing room…"
  #if canImport(WebRTC)
    @Published private(set) var localVideoTrack: RTCVideoTrack?
    @Published private(set) var remoteVideoTracks: [RTCVideoTrack] = []
  #endif
  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private var hostBridge: MediaSFUIosHostBridge?
    private var observationTask: Task<Void, Never>?
  #endif
  #if canImport(MediaSFUMediasoupClient)
    private var nativeDevice: MSCDevice?
  #endif

  func makeViewController(configuration: MediaSFURoomConfiguration) -> UIViewController {
    #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
      let bridge = MediaSFUIosHostBridge()
      let launch = bridge.makeLaunchConfig()
      // The backend handoff replaces these non-secret bootstrap values before signaling.
      launch.apiUserName = "roomUser"
      launch.apiKey = String(repeating: "0", count: 64)
      launch.cloudRoomsEndpoint = ""
      launch.localLink = ""
      launch.userName = configuration.userName
      launch.roomName = configuration.roomName
      launch.roomApiToken = configuration.roomApiToken
      launch.roomLink = configuration.roomLink
      launch.islevel = configuration.islevel
      launch.adminPasscode = configuration.adminPasscode
      launch.action = configuration.action
      launch.eventType = configuration.eventType
      launch.connectMediaSFU = configuration.connectMediaSFU
      launch.autoProceed = true
      hostBridge = bridge
      #if canImport(MediaSFUMediasoupClient)
        let device = MSCDevice()
        nativeDevice = device
        _ = MediaSFUKmpBridgeInstaller.installMediaSFUMediasoupClientBridgeIfSupported(
          device: device)
      #endif
      state = "Connecting…"
      observe(host: bridge)
      return bridge.makeHostViewController(config: launch)
    #else
      let controller = UIViewController()
      controller.view.backgroundColor = .systemBackground
      let label = UILabel()
      label.text = "Add the MediaSFUAppleSDK Swift package to enable the room UI."
      label.numberOfLines = 0
      label.textAlignment = .center
      label.translatesAutoresizingMaskIntoConstraints = false
      controller.view.addSubview(label)
      NSLayoutConstraint.activate([
        label.leadingAnchor.constraint(equalTo: controller.view.leadingAnchor, constant: 24),
        label.trailingAnchor.constraint(equalTo: controller.view.trailingAnchor, constant: -24),
        label.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor),
      ])
      state = "SDK package not linked"
      return controller
    #endif
  }

  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private func observe(host: MediaSFUIosHostBridge) {
      observationTask?.cancel()
      observationTask = Task { [weak self] in
        var attempts = 0
        while !Task.isCancelled {
          try? await Task.sleep(nanoseconds: 250_000_000)
          guard let self else { return }
          attempts += 1
          let summary = host.latestRuntimeProbeSummary()
          if summary.contains("lastSignalStage=join-ok")
            || (summary.contains("participants=")
              && summary.contains("participants=0") == false)
          {
            state = "Connected"
          }
          if summary.contains("lastSignalStage=join-fail")
            || summary.contains("lastSignalStage=rest-fail")
          {
            state = "Connection needs attention"
          } else if attempts == 80 && state == "Connecting…" {
            state = "Still connecting…"
          }
          #if canImport(WebRTC)
            let local = host.latestLocalVideoTrack() as? RTCVideoTrack
            let remote = host.latestRemoteVideoTracks().compactMap { $0 as? RTCVideoTrack }
            if localVideoTrack?.trackId != local?.trackId { localVideoTrack = local }
            if remoteVideoTracks.map(\.trackId) != remote.map(\.trackId) {
              remoteVideoTracks = remote
            }
          #endif
        }
      }
    }

    func toggleAudio() { _ = hostBridge?.triggerToggleAudio() }
    func toggleVideo() { _ = hostBridge?.triggerToggleVideo() }
    func toggleScreenShare() { _ = hostBridge?.triggerToggleScreenShare() }
  #else
    func toggleAudio() {}
    func toggleVideo() {}
    func toggleScreenShare() {}
  #endif
}

struct MediaSFUNativeRoomView: UIViewControllerRepresentable {
  @ObservedObject var controller: MediaSFURoomController
  let configuration: MediaSFURoomConfiguration

  func makeUIViewController(context: Context) -> UIViewController {
    controller.makeViewController(configuration: configuration)
  }

  func updateUIViewController(_ viewController: UIViewController, context: Context) {}
}

#if canImport(WebRTC)
  private struct MediaSFUVideoTrackRenderer: UIViewRepresentable {
    let track: RTCVideoTrack
    var mirrored = false

    final class Coordinator {
      var track: RTCVideoTrack?
      weak var renderer: RTCMTLVideoView?
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> RTCMTLVideoView {
      let view = RTCMTLVideoView(frame: .zero)
      view.videoContentMode = .scaleAspectFill
      context.coordinator.renderer = view
      attach(to: view, context: context)
      return view
    }

    func updateUIView(_ view: RTCMTLVideoView, context: Context) {
      attach(to: view, context: context)
    }

    private func attach(to view: RTCMTLVideoView, context: Context) {
      if context.coordinator.track !== track {
        context.coordinator.track?.remove(view)
        context.coordinator.track = track
        track.add(view)
      }
      view.transform = mirrored ? CGAffineTransform(scaleX: -1, y: 1) : .identity
    }

    static func dismantleUIView(_ view: RTCMTLVideoView, coordinator: Coordinator) {
      coordinator.track?.remove(view)
    }
  }

  struct MediaSFUHeadlessVideoStage: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color
    let emptyTitle: String

    var body: some View {
      ZStack(alignment: .bottomTrailing) {
        Color.black
        if let remote = controller.remoteVideoTracks.first {
          MediaSFUVideoTrackRenderer(track: remote).id(remote.trackId)
        } else if let local = controller.localVideoTrack {
          MediaSFUVideoTrackRenderer(track: local, mirrored: true).id(local.trackId)
        } else {
          VStack(spacing: 10) {
            Image(systemName: "video.slash.fill").font(.title).foregroundStyle(accent)
            Text(emptyTitle).font(.subheadline.weight(.bold)).foregroundStyle(.white)
            Text(controller.state).font(.caption).foregroundStyle(.white.opacity(0.58))
          }
        }

        if let local = controller.localVideoTrack, !controller.remoteVideoTracks.isEmpty {
          MediaSFUVideoTrackRenderer(track: local, mirrored: true).id("local-\(local.trackId)")
            .frame(width: 104, height: 78).clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white.opacity(0.65), lineWidth: 2))
            .padding(12)
        }

        HStack(spacing: 6) {
          Circle().fill(controller.remoteVideoTracks.isEmpty ? Color.orange : Color.green)
            .frame(width: 7, height: 7)
          Text(controller.remoteVideoTracks.isEmpty ? "Your camera" : "Remote camera")
            .font(.caption2.weight(.black))
        }.foregroundStyle(.white).padding(.horizontal, 9).padding(.vertical, 6)
          .background(.black.opacity(0.62)).clipShape(Capsule()).padding(12)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading)
      }
      .clipped()
    }
  }
#else
  struct MediaSFUHeadlessVideoStage: View {
    @ObservedObject var controller: MediaSFURoomController
    let accent: SwiftUI.Color
    let emptyTitle: String
    var body: some View {
      Color.black.overlay(Text(emptyTitle).foregroundStyle(.white))
    }
  }
#endif
