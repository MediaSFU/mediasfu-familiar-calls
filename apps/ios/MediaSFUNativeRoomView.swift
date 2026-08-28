import Foundation
import SwiftUI
import UIKit

#if canImport(MediaSFUAppleSDK)
import MediaSFUAppleSDK
#endif
#if canImport(MediaSFUMediasoupClient)
import MediaSFUMediasoupClient
#endif

/// Runtime-only configuration for the shared MediaSFU room UI.
/// API values are intentionally read from the launch environment; never commit them.
struct MediaSFURoomConfiguration {
    var apiUserName: String = ProcessInfo.processInfo.environment["MEDIASFU_API_USERNAME"] ?? ""
    var apiKey: String = ProcessInfo.processInfo.environment["MEDIASFU_API_KEY"] ?? ""
    var cloudRoomsEndpoint: String = ProcessInfo.processInfo.environment["MEDIASFU_CLOUD_ROOMS_ENDPOINT"] ?? ""
    var localLink: String = ""
    var userName: String
    var roomName: String = ""
    var action: String
    var eventType: String = "conference"
    var connectMediaSFU: Bool = true
}

@MainActor
final class MediaSFURoomController: ObservableObject {
    @Published private(set) var state = "Preparing room…"
#if canImport(MediaSFUAppleSDK)
    private var hostBridge: MediaSFUIosHostBridge?
#endif
#if canImport(MediaSFUMediasoupClient)
    private var nativeDevice: MSCDevice?
#endif

    func makeViewController(configuration: MediaSFURoomConfiguration) -> UIViewController {
#if canImport(MediaSFUAppleSDK)
        let bridge = MediaSFUIosHostBridge()
        let launch = bridge.makeLaunchConfig()
        launch.apiUserName = configuration.apiUserName
        launch.apiKey = configuration.apiKey
        launch.cloudRoomsEndpoint = configuration.cloudRoomsEndpoint
        launch.localLink = configuration.localLink
        launch.userName = configuration.userName
        launch.roomName = configuration.roomName
        launch.action = configuration.action
        launch.eventType = configuration.eventType
        launch.connectMediaSFU = configuration.connectMediaSFU
        launch.autoProceed = true
        hostBridge = bridge
#if canImport(MediaSFUMediasoupClient)
        let device = MSCDevice()
        nativeDevice = device
        _ = MediaSFUKmpBridgeInstaller.installMediaSFUMediasoupClientBridgeIfSupported(device: device)
#endif
        state = "Room connected"
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
            label.centerYAnchor.constraint(equalTo: controller.view.centerYAnchor)
        ])
        state = "SDK package not linked"
        return controller
#endif
    }

#if canImport(MediaSFUAppleSDK)
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
