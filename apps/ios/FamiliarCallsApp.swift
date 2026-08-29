import SwiftUI

@main
struct FamiliarCallsApp: App {
  var body: some Scene { WindowGroup { FamiliarCallsRootView() } }
}

struct FamiliarCallsRootView: View {
  @StateObject private var model = FamiliarCallsModel()
  var body: some View {
    Group {
      if model.identity == nil {
        FamiliarOnboardingView(model: model)
      } else if model.activeSession == nil {
        FamiliarHomeView(model: model)
      } else {
        FamiliarCallView(model: model)
      }
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
  @Published var online = false
  @Published var busy = false
  let api = FamiliarCallsAPI()
  init() {
    if let data = UserDefaults.standard.data(forKey: "mediasfu.familiar.identity"),
      let value = try? JSONDecoder().decode(FamiliarIdentity.self, from: data)
    {
      identity = value
      refresh()
    }
  }
  func saveIdentity(userId: String, displayName: String) {
    guard userId.range(of: "^[A-Za-z0-9_-]{2,64}$", options: .regularExpression) != nil else {
      notice = "User ID: use 2–64 letters, numbers, _ or -."
      return
    }
    guard displayName.range(of: "^[A-Za-z0-9]{2,10}$", options: .regularExpression) != nil else {
      notice = "Display name: use 2–10 letters or numbers."
      return
    }
    let value = FamiliarIdentity(userId: userId, displayName: displayName)
    identity = value
    UserDefaults.standard.set(
      try? JSONEncoder().encode(value), forKey: "mediasfu.familiar.identity")
    refresh()
  }
  func refresh() {
    guard let identity else { return }
    Task {
      do {
        sessions = try await api.sessions(for: identity.userId)
        online = true
      } catch {
        online = false
      }
    }
  }
  func start(target: String, callType: String) {
    guard let identity else { return }
    guard target.range(of: "^[A-Za-z0-9_-]{2,64}$", options: .regularExpression) != nil,
      target != identity.userId
    else {
      notice = "Choose a different, valid contact ID."
      return
    }
    busy = true
    notice = "Creating a private call…"
    Task {
      do {
        let value = try await api.create(
          hostUserId: identity.userId, targetUserId: target, displayName: identity.displayName,
          callType: callType)
        activeSession = value.0
        roomData = value.1
        refresh()
      } catch { notice = error.localizedDescription }
      busy = false
    }
  }
  func accept(_ session: FamiliarSession) {
    guard let identity else { return }
    busy = true
    notice = "Joining the call…"
    Task {
      do {
        let value = try await api.join(
          sessionId: session.id, userId: identity.userId, displayName: identity.displayName)
        activeSession = value.0
        roomData = value.1
        refresh()
      } catch { notice = error.localizedDescription }
      busy = false
    }
  }
  func endCall() {
    guard let identity, let session = activeSession else { return }
    Task {
      do {
        try await api.end(sessionId: session.id, userId: identity.userId)
        activeSession = nil
        roomData = [:]
        refresh()
      } catch { notice = error.localizedDescription }
    }
  }
  func resetIdentity() {
    identity = nil
    activeSession = nil
    sessions = []
    UserDefaults.standard.removeObject(forKey: "mediasfu.familiar.identity")
  }
}

private let familiarGreen = Color(red: 0.10, green: 0.50, blue: 0.29)
private let familiarBackground = Color(red: 0.95, green: 0.98, blue: 0.95)
private let familiarInk = Color(red: 0.06, green: 0.15, blue: 0.10)
private let familiarMuted = Color(red: 0.40, green: 0.49, blue: 0.43)

private struct FamiliarPrimaryButton: View {
  let title: String
  let action: () -> Void
  var disabled = false
  var body: some View {
    Button(action: action) {
      HStack {
        Text(title).fontWeight(.bold)
        Spacer()
        Text("→").font(.title3)
      }
      .foregroundStyle(.white).padding(.horizontal, 18).frame(height: 54)
      .background(
        LinearGradient(
          colors: [
            Color(red: 0.18, green: 0.55, blue: 0.33), Color(red: 0.13, green: 0.45, blue: 0.27),
          ], startPoint: .topLeading, endPoint: .bottomTrailing)
      )
      .clipShape(RoundedRectangle(cornerRadius: 15))
    }
    .buttonStyle(.plain).disabled(disabled).opacity(disabled ? 0.55 : 1)
  }
}

private struct FamiliarField: View {
  let label: String
  let placeholder: String
  @Binding var value: String
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label).font(.subheadline.weight(.bold)).foregroundStyle(
        Color(red: 0.16, green: 0.29, blue: 0.22))
      TextField(placeholder, text: $value)
        .textInputAutocapitalization(.never).autocorrectionDisabled()
        .padding(.horizontal, 16).frame(height: 52)
        .background(Color(red: 0.97, green: 0.98, blue: 0.97))
        .overlay(
          RoundedRectangle(cornerRadius: 15).stroke(Color(red: 0.79, green: 0.85, blue: 0.80)))
    }
  }
}

struct FamiliarOnboardingView: View {
  @ObservedObject var model: FamiliarCallsModel
  @State private var userId = ""
  @State private var displayName = ""
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        Text("M").font(.system(size: 25, weight: .black)).foregroundStyle(.white)
          .frame(width: 56, height: 56)
          .background(
            LinearGradient(
              colors: [
                Color(red: 0.18, green: 0.55, blue: 0.33),
                Color(red: 0.13, green: 0.45, blue: 0.27),
              ], startPoint: .topLeading, endPoint: .bottomTrailing)
          )
          .clipShape(RoundedRectangle(cornerRadius: 18)).padding(.bottom, 24)
        Text("MEDIASFU FAMILIAR CALLS").font(.caption2.weight(.black)).tracking(1.8)
          .foregroundStyle(familiarGreen).padding(.bottom, 8)
        Text("Calls that feel instantly familiar.").font(
          .system(size: 42, weight: .black, design: .rounded)
        ).tracking(-1.4).foregroundStyle(familiarInk)
        Text(
          "Choose how friends identify you. Calls happen from your contacts screen—room IDs stay behind the scenes."
        )
        .font(.body).foregroundStyle(familiarMuted).lineSpacing(5).padding(.vertical, 20)
        VStack(spacing: 17) {
          FamiliarField(label: "Display name", placeholder: "Alex", value: $displayName)
          FamiliarField(label: "Your user ID", placeholder: "alex-01", value: $userId)
          if !model.notice.isEmpty {
            Text(model.notice).foregroundStyle(.red).font(.footnote).frame(
              maxWidth: .infinity, alignment: .leading)
          }
          FamiliarPrimaryButton(title: "Continue to calls") {
            model.saveIdentity(userId: userId, displayName: displayName)
          }
        }
        Text("Calls connect securely through your app's backend.").font(.footnote).foregroundStyle(
          familiarMuted
        ).lineSpacing(3).padding(.top, 20)
      }
      .padding(28).background(.white.opacity(0.96)).clipShape(RoundedRectangle(cornerRadius: 30))
      .overlay(RoundedRectangle(cornerRadius: 30).stroke(Color(red: 0.84, green: 0.89, blue: 0.85)))
      .shadow(color: Color.black.opacity(0.08), radius: 30, y: 18)
      .frame(maxWidth: 520).padding(.horizontal, 18).padding(.vertical, 28)
    }
    .background(
      LinearGradient(
        colors: [
          Color(red: 0.88, green: 0.95, blue: 0.89), familiarBackground,
          Color(red: 0.91, green: 0.95, blue: 0.91),
        ], startPoint: .topLeading, endPoint: .bottomTrailing
      ).ignoresSafeArea())
  }
}

struct FamiliarHomeView: View {
  @ObservedObject var model: FamiliarCallsModel
  @State private var target = ""
  @State private var callType = "video"
  var identity: FamiliarIdentity { model.identity! }
  var incoming: FamiliarSession? {
    model.sessions.first { $0.targetUserId == identity.userId && $0.status == "ringing" }
  }
  private var initials: String { String(identity.displayName.prefix(2)).uppercased() }
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 22) {
        HStack(alignment: .center) {
          VStack(alignment: .leading, spacing: 4) {
            Text("MEDIA CALLS").font(.caption2.weight(.black)).tracking(1.8).foregroundStyle(
              familiarGreen)
            Text("Chats & calls").font(.system(size: 36, weight: .black, design: .rounded))
              .foregroundStyle(familiarInk)
          }
          Spacer()
          Button(action: model.resetIdentity) {
            Text(initials).font(.headline.weight(.black)).foregroundStyle(.white).frame(
              width: 48, height: 48
            ).background(familiarGreen).clipShape(Circle())
          }.buttonStyle(.plain).padding(7).background(.white).clipShape(
            RoundedRectangle(cornerRadius: 18))
        }
        HStack(spacing: 8) {
          Circle().fill(model.online ? Color.green : Color.orange).frame(width: 8, height: 8)
          Text(model.online ? "Ready for calls" : "Backend reconnecting…").font(
            .caption.weight(.bold)
          ).foregroundStyle(Color(red: 0.20, green: 0.45, blue: 0.31))
        }
        .padding(.horizontal, 13).padding(.vertical, 9).background(
          Color(red: 0.93, green: 0.98, blue: 0.94)
        ).clipShape(Capsule())
        if let incoming {
          VStack(alignment: .leading, spacing: 12) {
            Text("INCOMING \(incoming.callType.uppercased()) CALL").font(.caption2.weight(.black))
              .tracking(1.5).foregroundStyle(familiarGreen)
            Text(incoming.displayName.isEmpty ? incoming.hostUserId : incoming.displayName).font(
              .title2.weight(.black))
            Text("@\(incoming.hostUserId) is calling").foregroundStyle(familiarMuted)
            HStack {
              Button("Decline", role: .destructive) {
                Task {
                  try? await model.api.end(
                    sessionId: incoming.id, userId: identity.userId, reason: "declined")
                  model.refresh()
                }
              }
              Button("Accept call") { model.accept(incoming) }.buttonStyle(.borderedProminent).tint(
                familiarGreen)
            }
          }.padding(22).background(
            LinearGradient(
              colors: [Color(red: 0.91, green: 0.98, blue: 0.93), .white], startPoint: .topLeading,
              endPoint: .bottomTrailing)
          ).clipShape(RoundedRectangle(cornerRadius: 24))
        }
        VStack(alignment: .leading, spacing: 17) {
          HStack {
            VStack(alignment: .leading, spacing: 4) {
              Text("Start a call").font(.title2.weight(.black))
              Text("Invite someone by their user ID").foregroundStyle(familiarMuted)
            }
            Spacer()
            Text("☎").font(.title3).frame(width: 44, height: 44).background(
              Color(red: 0.90, green: 0.96, blue: 0.91)
            ).clipShape(RoundedRectangle(cornerRadius: 14))
          }
          FamiliarField(
            label: "Who would you like to call?", placeholder: "friend-user-id", value: $target)
          Picker("Call type", selection: $callType) {
            Text("▰  Video").tag("video")
            Text("●  Audio").tag("audio")
          }.pickerStyle(.segmented)
          if !model.notice.isEmpty { Text(model.notice).foregroundStyle(.red).font(.footnote) }
          FamiliarPrimaryButton(
            title: model.busy ? "Opening…" : "Call now",
            action: { model.start(target: target, callType: callType) }, disabled: model.busy)
        }.padding(22).background(.white.opacity(0.96)).clipShape(RoundedRectangle(cornerRadius: 25))
          .overlay(
            RoundedRectangle(cornerRadius: 25).stroke(Color(red: 0.85, green: 0.90, blue: 0.86)))
        VStack(alignment: .leading, spacing: 16) {
          HStack {
            VStack(alignment: .leading, spacing: 4) {
              Text("Recent calls").font(.title2.weight(.black))
              Text("Session details only—never call media").foregroundStyle(familiarMuted)
            }
            Spacer()
            Text("\(model.sessions.count)").fontWeight(.bold).frame(width: 36, height: 36)
              .background(Color(red: 0.93, green: 0.96, blue: 0.93)).clipShape(Circle())
          }
          if model.sessions.isEmpty {
            VStack(spacing: 8) {
              Text("☏").font(.system(size: 38)).foregroundStyle(familiarGreen)
              Text("Your recent calls appear here").fontWeight(.bold)
              Text("Call a contact to get started.").foregroundStyle(familiarMuted)
            }.frame(maxWidth: .infinity).padding(.vertical, 24)
          } else {
            ForEach(model.sessions) { session in
              HStack {
                Text(
                  session.hostUserId == identity.userId ? session.targetUserId : session.hostUserId
                ).fontWeight(.bold)
                Spacer()
                Text(session.status.capitalized).foregroundStyle(familiarMuted)
              }.padding(.vertical, 8)
            }
          }
        }.padding(22).background(.white.opacity(0.96)).clipShape(RoundedRectangle(cornerRadius: 25))
          .overlay(
            RoundedRectangle(cornerRadius: 25).stroke(Color(red: 0.85, green: 0.90, blue: 0.86)))
      }.padding(18).frame(maxWidth: 700)
    }.background(familiarBackground.ignoresSafeArea()).task {
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1.5))
        model.refresh()
      }
    }
  }
}

struct FamiliarCallView: View {
  @ObservedObject var model: FamiliarCallsModel
  @StateObject private var room = MediaSFURoomController()
  var identity: FamiliarIdentity { model.identity! }
  var session: FamiliarSession { model.activeSession! }
  private var mediaSFURoomName: String {
    model.roomData["roomName"] as? String ?? session.meetingId
  }
  private var roomApiToken: String { model.roomData["secret"] as? String ?? "" }
  private var roomLink: String { model.roomData["link"] as? String ?? "" }
  var body: some View {
    ZStack(alignment: .bottom) {
      MediaSFUNativeRoomView(
        controller: room,
        configuration: MediaSFURoomConfiguration(
          userName: identity.displayName, roomName: mediaSFURoomName, roomApiToken: roomApiToken,
          roomLink: roomLink, action: "join")
      )
      .ignoresSafeArea()
      VStack(spacing: 12) {
        HStack {
          VStack(alignment: .leading) {
            Text("MEDIA CALL").font(.caption.weight(.bold))
            Text(session.hostUserId == identity.userId ? session.targetUserId : session.hostUserId)
              .font(.title2.bold())
          }
          Spacer()
          Text(room.state).font(.caption).padding(8).background(.thinMaterial).clipShape(Capsule())
        }.foregroundStyle(.white)
        Spacer()
        HStack(spacing: 14) {
          Button {
            room.toggleAudio()
          } label: {
            Image(systemName: "mic.fill").frame(width: 48, height: 48)
          }.buttonStyle(.borderedProminent)
          Button {
            room.toggleVideo()
          } label: {
            Image(systemName: "video.fill").frame(width: 48, height: 48)
          }.buttonStyle(.borderedProminent)
          Button {
            room.toggleScreenShare()
          } label: {
            Image(systemName: "rectangle.inset.filled.and.person.filled").frame(
              width: 48, height: 48)
          }.buttonStyle(.borderedProminent)
          Button(role: .destructive) {
            model.endCall()
          } label: {
            Image(systemName: "phone.down.fill").frame(width: 48, height: 48)
          }.buttonStyle(.borderedProminent)
        }.foregroundStyle(.white)
      }.padding(18).background(.black.opacity(0.35))
    }.onDisappear { if model.activeSession != nil { model.endCall() } }
  }
}
