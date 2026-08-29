import Foundation
import SwiftUI
import UIKit

#if canImport(MediaSFUAppleSDK)
  import MediaSFUAppleSDK
#elseif canImport(MediaSFUSDK)
  import MediaSFUSDK
  import MediaSFUIosBridge
#endif
#if canImport(MediaSFUMediasoupClient)
  import MediaSFUMediasoupClient
#endif

/// Runtime-only configuration for the shared MediaSFU room UI.
/// API values are intentionally read from the launch environment; never commit them.
struct MediaSFURoomConfiguration {
  var apiUserName: String = ProcessInfo.processInfo.environment["MEDIASFU_API_USERNAME"] ?? ""
  var apiKey: String = ProcessInfo.processInfo.environment["MEDIASFU_API_KEY"] ?? ""
  var cloudRoomsEndpoint: String =
    ProcessInfo.processInfo.environment["MEDIASFU_CLOUD_ROOMS_ENDPOINT"] ?? ""
  var localLink: String = ""
  var userName: String
  var roomName: String = ""
  /// Optional room-scoped handoff returned by the app's backend create/join call.
  var roomApiToken: String = ""
  var roomLink: String = ""
  var action: String
  var eventType: String = "conference"
  var connectMediaSFU: Bool = true
}

@MainActor
final class MediaSFURoomController: ObservableObject {
  @Published private(set) var state = "Preparing room…"
  #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
    private var hostBridge: MediaSFUIosHostBridge?
  #endif
  #if canImport(MediaSFUMediasoupClient)
    private var nativeDevice: MSCDevice?
  #endif

  func makeViewController(configuration: MediaSFURoomConfiguration) -> UIViewController {
    #if canImport(MediaSFUAppleSDK) || canImport(MediaSFUSDK)
      let bridge = MediaSFUIosHostBridge()
      let launch = bridge.makeLaunchConfig()
      let hasBackendHandoff =
        !configuration.roomApiToken.isEmpty && !configuration.roomLink.isEmpty
      launch.apiUserName = hasBackendHandoff ? "dummyUsr" : configuration.apiUserName
      launch.apiKey =
        hasBackendHandoff ? String(repeating: "0", count: 64) : configuration.apiKey
      launch.cloudRoomsEndpoint = configuration.cloudRoomsEndpoint
      launch.localLink = configuration.localLink
      launch.userName = configuration.userName
      launch.roomName = configuration.roomName
      launch.roomApiToken = configuration.roomApiToken
      launch.roomLink = configuration.roomLink
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
      Task { [weak self] in
        for _ in 0..<80 {
          try? await Task.sleep(for: .milliseconds(250))
          let summary = bridge.latestRuntimeProbeSummary()
          if summary.contains("lastSignalStage=join-ok") {
            self?.state = "Connected"
            return
          }
          if summary.contains("lastSignalStage=join-fail")
            || summary.contains("lastSignalStage=rest-fail")
          {
            self?.state = "Connection needs attention"
            return
          }
        }
        if self?.state == "Connecting…" { self?.state = "Still connecting…" }
      }
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
