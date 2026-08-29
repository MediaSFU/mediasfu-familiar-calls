import SwiftUI

@main
struct FamiliarCallsApp: App {
    var body: some Scene { WindowGroup { FamiliarCallsRootView() } }
}

struct FamiliarCallsRootView: View {
    @StateObject private var model = FamiliarCallsModel()
    var body: some View {
        Group {
            if model.identity == nil { FamiliarOnboardingView(model: model) }
            else if model.activeSession == nil { FamiliarHomeView(model: model) }
            else { FamiliarCallView(model: model) }
        }
        .preferredColorScheme(.light)
    }
}

@MainActor
final class FamiliarCallsModel: ObservableObject {
    @Published var identity: FamiliarIdentity?
    @Published var sessions: [FamiliarSession] = []
    @Published var activeSession: FamiliarSession?
    @Published var roomData: [String: Any] = [:]
    @Published var notice = ""
    @Published var busy = false
    let api = FamiliarCallsAPI()
    init() {
        if let data = UserDefaults.standard.data(forKey: "mediasfu.familiar.identity"), let value = try? JSONDecoder().decode(FamiliarIdentity.self, from: data) { identity = value; refresh() }
    }
    func saveIdentity(userId: String, displayName: String) {
        guard userId.range(of: "^[A-Za-z0-9_-]{2,64}$", options: .regularExpression) != nil else { notice = "User ID: use 2–64 letters, numbers, _ or -."; return }
        guard displayName.range(of: "^[A-Za-z0-9]{2,10}$", options: .regularExpression) != nil else { notice = "Display name: use 2–10 letters or numbers."; return }
        let value = FamiliarIdentity(userId: userId, displayName: displayName)
        identity = value; UserDefaults.standard.set(try? JSONEncoder().encode(value), forKey: "mediasfu.familiar.identity"); refresh()
    }
    func refresh() {
        guard let identity else { return }
        Task { do { sessions = try await api.sessions(for: identity.userId) } catch { notice = error.localizedDescription } }
    }
    func start(target: String, callType: String) {
        guard let identity else { return }
        guard target.range(of: "^[A-Za-z0-9_-]{2,64}$", options: .regularExpression) != nil, target != identity.userId else { notice = "Choose a different, valid contact ID."; return }
        busy = true; notice = "Creating a private call…"
        Task { do { let value = try await api.create(hostUserId: identity.userId, targetUserId: target, displayName: identity.displayName, callType: callType); activeSession = value.0; roomData = value.1; refresh() } catch { notice = error.localizedDescription }; busy = false }
    }
    func accept(_ session: FamiliarSession) {
        guard let identity else { return }
        busy = true; notice = "Joining the call…"
        Task { do { let value = try await api.join(sessionId: session.id, userId: identity.userId, displayName: identity.displayName); activeSession = value.0; roomData = value.1; refresh() } catch { notice = error.localizedDescription }; busy = false }
    }
    func endCall() {
        guard let identity, let session = activeSession else { return }
        Task { do { try await api.end(sessionId: session.id, userId: identity.userId); activeSession = nil; roomData = [:]; refresh() } catch { notice = error.localizedDescription } }
    }
    func resetIdentity() { identity = nil; activeSession = nil; sessions = []; UserDefaults.standard.removeObject(forKey: "mediasfu.familiar.identity") }
}

private let familiarGreen = Color(red: 0.10, green: 0.50, blue: 0.29)
private let familiarBackground = Color(red: 0.95, green: 0.98, blue: 0.95)

struct FamiliarOnboardingView: View {
    @ObservedObject var model: FamiliarCallsModel
    @State private var userId = ""
    @State private var displayName = ""
    var body: some View { ScrollView { VStack(alignment: .leading, spacing: 18) {
        Text("M").font(.system(size: 30, weight: .black)).foregroundStyle(.white).frame(width: 64, height: 64).background(familiarGreen).clipShape(Circle())
        Text("MEDIA CALLS, MADE SIMPLE").font(.caption.weight(.bold)).foregroundStyle(familiarGreen)
        Text("Your calls, in one calm place.").font(.system(size: 34, weight: .bold))
        Text("Choose your identity once. Then create or accept calls without putting cloud credentials on your phone.").foregroundStyle(.secondary)
        GroupBox { VStack(alignment: .leading, spacing: 12) {
            Text("Set up your profile").font(.title3.weight(.bold))
            TextField("User ID", text: $userId).textInputAutocapitalization(.never).textFieldStyle(.roundedBorder)
            TextField("Display name", text: $displayName).textInputAutocapitalization(.never).textFieldStyle(.roundedBorder)
            if !model.notice.isEmpty { Text(model.notice).foregroundStyle(.red).font(.footnote) }
            Button("Continue") { model.saveIdentity(userId: userId, displayName: displayName) }.buttonStyle(.borderedProminent).tint(familiarGreen)
        } }
        Text("The app talks to your backend proxy. API keys stay on the server.").font(.footnote).foregroundStyle(.secondary)
    }.padding(24) }.background(familiarBackground.ignoresSafeArea()) }
}

struct FamiliarHomeView: View {
    @ObservedObject var model: FamiliarCallsModel
    @State private var target = ""
    @State private var callType = "video"
    var identity: FamiliarIdentity { model.identity! }
    var incoming: FamiliarSession? { model.sessions.first { $0.targetUserId == identity.userId && $0.status == "ringing" } }
    var body: some View { NavigationStack { List {
        Section { VStack(alignment: .leading, spacing: 4) { Text("Chats & calls").font(.title.bold()); Text("Ready · MediaSFU Apple SDK").foregroundStyle(.secondary) } } header: { HStack { Spacer(); Button(identity.displayName) { model.resetIdentity() } } }
        if let incoming { Section { VStack(alignment: .leading, spacing: 10) { Text("Incoming \(incoming.callType) call").font(.headline); Text(incoming.displayName.isEmpty ? incoming.hostUserId : incoming.displayName).font(.title3.bold()); Text("@\(incoming.hostUserId) is calling").foregroundStyle(.secondary); HStack { Button("Decline", role: .destructive) { Task { try? await model.api.end(sessionId: incoming.id, userId: identity.userId, reason: "declined"); model.refresh() } }; Button("Accept call") { model.accept(incoming) }.buttonStyle(.borderedProminent).tint(familiarGreen) } } } }
        Section("Start a call") { TextField("Contact user ID", text: $target).textInputAutocapitalization(.never); Picker("Call type", selection: $callType) { Text("Video").tag("video"); Text("Audio").tag("audio") }.pickerStyle(.segmented); Button(model.busy ? "Opening…" : "Start call") { model.start(target: target, callType: callType) }.disabled(model.busy).buttonStyle(.borderedProminent).tint(familiarGreen) }
        Section("Recent calls") { if model.sessions.isEmpty { Text("No calls yet.").foregroundStyle(.secondary) } else { ForEach(model.sessions) { session in HStack { Text(session.hostUserId == identity.userId ? session.targetUserId : session.hostUserId); Spacer(); Text(session.status.capitalized).foregroundStyle(.secondary) } } } }
        if !model.notice.isEmpty { Text(model.notice).foregroundStyle(.red) }
    }.listStyle(.insetGrouped).navigationTitle("Media Calls") }.background(familiarBackground.ignoresSafeArea()).task { while !Task.isCancelled { try? await Task.sleep(for: .seconds(1.5)); model.refresh() } } }
}

struct FamiliarCallView: View {
    @ObservedObject var model: FamiliarCallsModel
    @StateObject private var room = MediaSFURoomController()
    var identity: FamiliarIdentity { model.identity! }
    var session: FamiliarSession { model.activeSession! }
    private var mediaSFURoomName: String { model.roomData["roomName"] as? String ?? session.meetingId }
    private var roomApiToken: String { model.roomData["secret"] as? String ?? "" }
    private var roomLink: String { model.roomData["link"] as? String ?? "" }
    var body: some View { ZStack(alignment: .bottom) {
        MediaSFUNativeRoomView(controller: room, configuration: MediaSFURoomConfiguration(userName: identity.displayName, roomName: mediaSFURoomName, roomApiToken: roomApiToken, roomLink: roomLink, action: "join"))
            .ignoresSafeArea()
        VStack(spacing: 12) { HStack { VStack(alignment: .leading) { Text("MEDIA CALL").font(.caption.weight(.bold)); Text(session.hostUserId == identity.userId ? session.targetUserId : session.hostUserId).font(.title2.bold()) }; Spacer(); Text(room.state).font(.caption).padding(8).background(.thinMaterial).clipShape(Capsule()) }.foregroundStyle(.white)
            Spacer(); HStack(spacing: 14) { Button { room.toggleAudio() } label: { Image(systemName: "mic.fill").frame(width: 48, height: 48) }.buttonStyle(.borderedProminent); Button { room.toggleVideo() } label: { Image(systemName: "video.fill").frame(width: 48, height: 48) }.buttonStyle(.borderedProminent); Button { room.toggleScreenShare() } label: { Image(systemName: "rectangle.inset.filled.and.person.filled").frame(width: 48, height: 48) }.buttonStyle(.borderedProminent); Button(role: .destructive) { model.endCall() } label: { Image(systemName: "phone.down.fill").frame(width: 48, height: 48) }.buttonStyle(.borderedProminent) }.foregroundStyle(.white) }.padding(18).background(.black.opacity(0.35))
    }.onDisappear { if model.activeSession != nil { model.endCall() } }
}
}
