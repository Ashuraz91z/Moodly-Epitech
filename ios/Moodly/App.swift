import SwiftUI

@main
struct MoodlyApp: App {
  @State private var api = API()
  var body: some Scene {
    WindowGroup {
      RootView()
        .environment(api)
        .tint(Palette.primary)
        .preferredColorScheme(.light)
    }
  }
}

// Connexion, puis l'espace du rôle : collaborateur, manager ou RH.
struct RootView: View {
  @Environment(API.self) private var api
  @State private var error: String?

  var body: some View {
    VStack(spacing: 0) {
      Group {
        if !api.signedIn {
          LoginView()
        } else if let me = api.me {
          switch me.role {
          case .employee: EmployeeHome()
          case .manager: MirrorScreen()
          case .admin: AdminHome()
          }
        } else {
          VStack(spacing: 16) {
            if let error {
              Text(error).multilineTextAlignment(.center).foregroundStyle(Palette.muted)
              Button("Réessayer") { Task { await load() } }.buttonStyle(GhostButton())
              Button("Se déconnecter") { Task { await api.logout() } }.font(.footnote)
            } else {
              ProgressView()
            }
          }
          .padding(32)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
          .task { await load() }
        }
      }
      .id(api.me?.id)
    }
    .background(Palette.page)
    #if DEBUG
    // Tests : `-demoRole manager` au lancement entre dans la démo avec ce rôle (`-demoReset NO` : sans remise à zéro).
    .task {
      if let role = UserDefaults.standard.string(forKey: "demoRole").flatMap(Role.init) {
        try? await api.enterDemo(role, reset: UserDefaults.standard.object(forKey: "demoReset") == nil || UserDefaults.standard.bool(forKey: "demoReset"))
      }
    }
    #endif
  }

  private func load() async {
    error = nil
    do { try await api.loadMe() } catch { self.error = error.localizedDescription }
  }
}

// MARK: Connexion

struct LoginView: View {
  @Environment(API.self) private var api
  @State private var email = ""
  @State private var password = ""
  @State private var busy = false
  @State private var error: String?
  @State private var editServer = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        VStack(alignment: .leading, spacing: 10) {
          Eyebrow(text: "Moodly")
          Text("Le moral de l'équipe, sans jamais exposer personne.").font(.display(30))
          Text("Une fois par semaine, 2 minutes. Ton manager ne voit qu'une moyenne d'équipe.")
            .foregroundStyle(Palette.muted)
        }
        .padding(.top, 24)

        VStack(spacing: 14) {
          TextField("E-mail", text: $email)
            .textContentType(.username).keyboardType(.emailAddress)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
            .padding(14).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12))
          SecureField("Mot de passe", text: $password)
            .textContentType(.password)
            .padding(14).background(Palette.soft, in: RoundedRectangle(cornerRadius: 12))
            .onSubmit(login)
          ErrorText(text: error)
          Button(busy ? "Connexion…" : "Se connecter", action: login)
            .buttonStyle(PrimaryButton())
            .disabled(busy || email.isEmpty || password.isEmpty)
        }
        .card()

        VStack(alignment: .leading, spacing: 12) {
          SectionTitle(title: "Découvrir sans compte", sub: "La démo repart de zéro à chaque lancement : 3 équipes, 8 semaines de réponses.")
          Button { demo(.employee) } label: { Label("Lancer la démo guidée", systemImage: "play.fill") }
            .buttonStyle(PrimaryButton(dark: true))
          HStack {
            ForEach([(Role.employee, "Collaborateur"), (.manager, "Manager"), (.admin, "RH")], id: \.1) { role, label in
              Button(label) { demo(role) }.buttonStyle(GhostButton())
            }
          }
          .disabled(busy)
        }
        .card()

        Button { editServer = true } label: {
          Label("Serveur : \(api.server)", systemImage: "network").font(.footnote).foregroundStyle(Palette.muted)
        }
      }
      .padding(20)
    }
    .disabled(busy)
    .sheet(isPresented: $editServer) { ServerSheet() }
  }

  private func login() {
    run { try await api.login(email: email.trimmingCharacters(in: .whitespaces).lowercased(), password: password) }
  }

  private func demo(_ role: Role) {
    run { try await api.enterDemo(role, reset: true) }
  }

  private func run(_ action: @escaping () async throws -> Void) {
    busy = true
    error = nil
    Task {
      do { try await action() } catch { self.error = error.localizedDescription }
      busy = false
    }
  }
}

private struct ServerSheet: View {
  @Environment(API.self) private var api
  @Environment(\.dismiss) private var dismiss
  @State private var url = ""
  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("http://10.0.0.2:3001", text: $url)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        } footer: {
          Text("Adresse de l'API Moodly. Sur un iPhone, mets l'adresse de l'ordinateur sur le même Wi-Fi (localhost ne marche que dans le simulateur).")
        }
      }
      .navigationTitle("Serveur")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Enregistrer") {
            api.server = url.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            dismiss()
          }
          .disabled(URL(string: url)?.scheme == nil)
        }
      }
      .onAppear { url = api.server }
    }
    .presentationDetents([.medium])
  }
}
