import Charts
import SwiftUI

// Back-office RH : agrégats seulement (semaines closes, équipes à 5 réponses minimum), comptes, équipes, sujets.
typealias Act = (_ ok: String, _ action: @escaping () async throws -> Void) async -> String?

private let roleLabel: [Role: String] = [.employee: "Collaborateur", .manager: "Manager", .admin: "Admin"]

private func signInDate(_ iso: String?) -> String {
  guard let iso else { return "Jamais" }
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  let date = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
  return date.map { $0.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: "fr_FR"))) } ?? "—"
}

struct AdminHome: View {
  @Environment(API.self) private var api
  @State private var data: AdminData?
  @State private var error: String?
  @State private var toast: String?

  var body: some View {
    Group {
      if let data {
        TabView {
          tab { Overview(data: data) }.tabItem { Label("Aperçu", systemImage: "square.grid.2x2") }
          tab { TeamsTab(data: data, act: act) }.tabItem { Label("Équipes", systemImage: "person.3") }
          tab { UsersTab(data: data, act: act) }.tabItem { Label("Comptes", systemImage: "person.crop.circle") }
          tab { TagsTab(data: data, act: act) }.tabItem { Label("Sujets", systemImage: "tag") }
        }
      } else {
        VStack(spacing: 16) {
          if let error {
            Text(error).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
            Button("Réessayer") { Task { await load() } }.buttonStyle(GhostButton())
            LogoutButton()
          } else { ProgressView() }
        }
        .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .overlay(alignment: .bottom) {
      if let toast {
        Label(toast, systemImage: "checkmark.circle.fill")
          .font(.subheadline.weight(.semibold)).foregroundStyle(.white)
          .padding(.horizontal, 16).padding(.vertical, 10)
          .background(Palette.ink, in: Capsule())
          .padding(.bottom, 64)
          .transition(.move(edge: .bottom).combined(with: .opacity))
      }
    }
    .animation(.spring(duration: 0.3), value: toast)
    .task { await load() }
  }

  private func tab<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
    NavigationStack {
      content()
        .background(Palette.page)
        .toolbar { ToolbarItem(placement: .topBarLeading) { Menu { LogoutButton() } label: { Image(systemName: "person.crop.circle") } } }
        .refreshable { await load() }
    }
  }

  private func load() async {
    error = nil
    do { data = try await api.get("/api/admin") } catch { self.error = error.localizedDescription }
  }

  // Exécute une action, recharge et confirme ; renvoie l'erreur à afficher sinon.
  private func act(_ ok: String, _ action: @escaping () async throws -> Void) async -> String? {
    do {
      try await action()
      await load()
      toast = ok
      Task {
        try? await Task.sleep(for: .seconds(2))
        if toast == ok { toast = nil }
      }
      return nil
    } catch {
      return error.localizedDescription
    }
  }
}

// MARK: Vue d'ensemble

private struct Spark: View {
  let trend: [TrendPoint]?
  var body: some View {
    if let trend, trend.count > 1 {
      let up = trend.last!.avg >= trend.first!.avg
      Chart(trend, id: \.weekStart) { LineMark(x: .value("Semaine", $0.weekStart), y: .value("Moral", $0.avg)).foregroundStyle(up ? Palette.green : Color(hex: 0xe11d48)) }
        .chartXAxis(.hidden).chartYAxis(.hidden).chartYScale(domain: 1...5)
        .frame(width: 80, height: 28)
        .accessibilityLabel("\(up ? "En hausse" : "En baisse") de \(fmt(abs(trend.last!.avg - trend.first!.avg))) pt sur \(trend.count) semaines")
    } else {
      Text("—").foregroundStyle(Palette.muted)
    }
  }
}

private struct MoodPill: View {
  let avg: Double?
  var body: some View {
    if let avg { Pill(text: "\(fmt(avg)) / 5", fg: tone(avg), bg: tone(avg).opacity(0.12)) } else { Pill(text: "—") }
  }
}

private struct Overview: View {
  let data: AdminData

  var body: some View {
    let count = { (r: Role) in data.users.filter { $0.role == r }.count }
    let email = Dictionary(uniqueKeysWithValues: data.users.map { ($0.id, $0.email) })
    let flagged = data.teams.filter(\.watch)
    let tags = data.tags.sorted { $0.uses > $1.uses }
    let plotted = data.teams.filter { $0.energy != nil && $0.pleasure != nil }
    let zones = data.stats.energyZones ?? [:]

    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("Semaine du \(Day.long(data.stats.weekStart)), la dernière close. Une équipe apparaît à partir de 5 réponses dans la semaine, pour préserver l'anonymat.")
          .font(.subheadline).foregroundStyle(Palette.muted)

        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
          Tile(title: "Comptes", value: "\(data.users.count)", sub: "\(count(.employee)) collab. · \(count(.manager)) managers · \(count(.admin)) admin", fill: .white)
          Tile(title: "Équipes", value: "\(data.teams.count)", sub: flagged.isEmpty ? "Aucune alerte" : "\(flagged.count) à surveiller", fill: flagged.isEmpty ? .white : Palette.roseSoft)
          Tile(title: "Participation", value: pct(data.stats.participation), sub: "cette semaine-là", fill: .white)
          Tile(title: "Moral moyen", value: data.stats.avg.map(fmt) ?? "—", sub: "sur 5, toutes équipes", fill: .white)
        }

        VStack(alignment: .leading, spacing: 14) {
          SectionTitle(title: "Santé des équipes")
          if data.teams.isEmpty { Text("Aucune équipe pour l'instant.").foregroundStyle(Palette.muted) }
          ForEach(data.teams) { t in
            VStack(alignment: .leading, spacing: 8) {
              HStack {
                Text(t.name).font(.headline)
                if t.watch { Pill(text: "À surveiller", fg: Palette.rose, bg: Palette.roseSoft) }
                Spacer()
                Spark(trend: t.trend)
              }
              Text(email[t.managerId] ?? "").font(.caption).foregroundStyle(Palette.muted)
              HStack {
                Text("\(t.size) membres").font(.caption)
                Meter(value: t.participation ?? 0, max: 1, color: Palette.primary).frame(width: 70)
                Text(pct(t.participation)).font(.caption.monospacedDigit())
                Spacer()
                MoodPill(avg: t.avg)
              }
            }
            if t.id != data.teams.last?.id { Divider() }
          }
        }
        .card()

        VStack(alignment: .leading, spacing: 12) {
          SectionTitle(title: "Matrice de l'entreprise", sub: "Plaisir × énergie, chaque point est une équipe (en rouge : à surveiller)")
          if plotted.isEmpty {
            Text("Pas encore assez de réponses : une équipe apparaît à partir de 5 réponses dans une semaine close.").foregroundStyle(Palette.muted)
          } else {
            MatrixPlot(marks: plotted.map { Mark(p: Axes(pleasure: $0.pleasure!, energy: $0.energy!, impact: $0.impact ?? 0), label: $0.name, color: $0.watch ? Palette.team : Palette.primary, strong: true) },
                       corners: zoneShares(zones, total: zones.values.reduce(0, +)))
            Text("Pourcentages : toutes les réponses de la semaine.").font(.footnote).foregroundStyle(Palette.muted)
          }
        }
        .card()

        VStack(alignment: .leading, spacing: 10) {
          SectionTitle(title: "Sujets les plus cités", sub: "4 semaines")
          ForEach(tags) { t in BarRow(label: t.label, value: Double(t.uses), max: Double(max(1, tags.first?.uses ?? 1)), text: "\(t.uses)") }
        }
        .card()

        ShareLink(item: csv([["Équipe", "Manager", "Membres", "Participation (%)", "Moral", "Plaisir", "Énergie", "Impact"]] + data.teams.map { t in
          [t.name, email[t.managerId] ?? "", "\(t.size)", t.participation.map { "\(Int(($0 * 100).rounded()))" } ?? ""] + [t.avg, t.pleasure, t.energy, t.impact].map { $0.map(fmt) ?? "" }
        } + [[], ["Sujet", "Citations 4 semaines"]] + tags.map { [$0.label, "\($0.uses)"] }), preview: SharePreview("moodly-rapport.csv")) {
          Label("Exporter le rapport (CSV)", systemImage: "square.and.arrow.up")
        }
        .buttonStyle(GhostButton())
      }
      .padding(20)
    }
    .navigationTitle("Vue d'ensemble")
  }
}

// MARK: Équipes

private struct TeamsTab: View {
  @Environment(API.self) private var api
  let data: AdminData
  let act: Act
  @State private var editing: AdminTeam?
  @State private var creating = false
  @State private var deleting: AdminTeam?
  @State private var error: String?

  var body: some View {
    let email = Dictionary(uniqueKeysWithValues: data.users.map { ($0.id, $0.email) })
    List {
      if let error { Text(error).foregroundStyle(Palette.rose) }
      if data.teams.isEmpty { Text("Aucune équipe. Crée la première et nomme son manager.").foregroundStyle(Palette.muted) }
      ForEach(data.teams) { t in
        Button { editing = t } label: {
          VStack(alignment: .leading, spacing: 6) {
            HStack {
              Text(t.name).font(.headline)
              if t.watch { Pill(text: "À surveiller", fg: Palette.rose, bg: Palette.roseSoft) }
              Spacer()
              MoodPill(avg: t.avg)
            }
            Text("Manager : \(email[t.managerId] ?? "—")").font(.caption).foregroundStyle(Palette.muted)
            Text("\(t.size) membres · participation \(pct(t.participation))").font(.caption)
          }
        }
        .foregroundStyle(.primary)
        .swipeActions {
          Button("Supprimer", role: .destructive) { deleting = t }
          Button("Modifier") { editing = t }.tint(Palette.primary)
        }
      }
    }
    .navigationTitle("Équipes")
    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { creating = true } label: { Label("Nouvelle équipe", systemImage: "plus") } } }
    .sheet(item: $editing) { TeamForm(data: data, team: $0, act: act) }
    .sheet(isPresented: $creating) { TeamForm(data: data, team: nil, act: act) }
    .confirmationDialog("Supprimer l'équipe « \(deleting?.name ?? "") » ?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
      Button("Supprimer", role: .destructive) {
        guard let t = deleting else { return }
        Task { error = await act("Équipe supprimée") { try await api.send("/api/admin/teams", ["id": t.id], method: "DELETE") } }
      }
    } message: {
      Text("Son historique (réponses, pronostics) sera effacé. Ses membres gardent leur compte, sans équipe.")
    }
  }

}

private struct TeamForm: View {
  @Environment(API.self) private var api
  @Environment(\.dismiss) private var dismiss
  let data: AdminData
  let team: AdminTeam?
  let act: Act
  @State private var name = ""
  @State private var manager = ""
  @State private var error: String?
  @State private var busy = false

  var body: some View {
    let taken = Set(data.teams.map(\.managerId))
    let candidates = data.users.filter { $0.role != .admin && (!taken.contains($0.id) || $0.id == team?.managerId) }
    NavigationStack {
      Form {
        TextField("Nom de l'équipe", text: $name)
        Picker("Manager", selection: $manager) {
          Text("Choisir un compte").tag("")
          ForEach(candidates) { Text($0.email).tag($0.id) }
        }
        Section {
          ErrorText(text: error)
        } footer: {
          Text(team != nil ? "Si tu changes de manager, l'ancien redevient collaborateur de l'équipe." : "Le compte choisi devient manager et rejoint l'équipe.")
            + Text(candidates.isEmpty ? " Aucun compte disponible : crée d'abord un compte collaborateur." : "")
        }
      }
      .navigationTitle(team == nil ? "Nouvelle équipe" : "Modifier l'équipe")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button(busy ? "…" : "Enregistrer") {
            busy = true
            Task {
              error = await act(team == nil ? "Équipe créée" : "Équipe modifiée") {
                try await api.send("/api/admin/teams", ["id": team?.id, "name": name.trimmingCharacters(in: .whitespaces), "managerId": manager])
              }
              busy = false
              if error == nil { dismiss() }
            }
          }
          .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || manager.isEmpty || busy)
        }
      }
      .onAppear {
        name = team?.name ?? ""
        manager = team?.managerId ?? ""
      }
    }
  }
}

// MARK: Comptes

private struct UsersTab: View {
  let data: AdminData
  let act: Act
  @State private var query = ""
  @State private var filter: Role?
  @State private var editing: AdminUser?
  @State private var creating = false

  var body: some View {
    let managed = Dictionary(uniqueKeysWithValues: data.teams.map { ($0.managerId, $0.name) })
    let teamName = Dictionary(uniqueKeysWithValues: data.teams.map { ($0.id, $0.name) })
    let list = data.users.filter { (query.isEmpty || $0.email.contains(query.lowercased())) && (filter == nil || $0.role == filter) }
    List {
      Picker("Rôle", selection: $filter) {
        Text("Tous").tag(Role?.none)
        Text("Collab.").tag(Role?.some(.employee))
        Text("Managers").tag(Role?.some(.manager))
        Text("Admins").tag(Role?.some(.admin))
      }
      .pickerStyle(.segmented)
      .listRowBackground(Color.clear)

      ForEach(list) { u in
        Button { editing = u } label: {
          VStack(alignment: .leading, spacing: 4) {
            HStack {
              Text(u.email).font(.subheadline.weight(.semibold))
              Spacer()
              Pill(text: roleLabel[u.role]!, fg: Palette.primary, bg: Palette.primarySoft)
            }
            Text(managed[u.id].map { "Manager de \($0)" } ?? u.teamId.flatMap { teamName[$0] } ?? (u.role == .admin ? "Toute l'entreprise" : "Sans équipe"))
              .font(.caption).foregroundStyle(Palette.muted)
            Text("Dernière connexion : \(signInDate(u.lastSignInAt))").font(.caption2).foregroundStyle(Palette.muted)
          }
        }
        .foregroundStyle(.primary)
      }
    }
    .searchable(text: $query, prompt: "Rechercher un e-mail")
    .navigationTitle("Comptes · \(data.users.count)")
    .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { creating = true } label: { Label("Nouveau compte", systemImage: "plus") } } }
    .sheet(item: $editing) { UserForm(data: data, user: $0, managerOf: managed[$0.id], act: act) }
    .sheet(isPresented: $creating) { NewUserForm(data: data, act: act) }
  }
}

private struct UserForm: View {
  @Environment(API.self) private var api
  @Environment(\.dismiss) private var dismiss
  let data: AdminData
  let user: AdminUser
  let managerOf: String?
  let act: Act
  @State private var role = Role.employee
  @State private var team = ""
  @State private var error: String?
  @State private var confirmDelete = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Compte") {
          Text(user.email)
          LabeledContent("Créé le", value: signInDate(user.createdAt))
          LabeledContent("Dernière connexion", value: signInDate(user.lastSignInAt))
        }
        if let managerOf {
          Section {
            Text("Manager de \(managerOf).")
          } footer: {
            Text("Pour changer son rôle ou le supprimer, nomme d'abord un autre manager dans l'onglet Équipes.")
          }
        } else {
          Section {
            Picker("Rôle", selection: $role) {
              Text("Collaborateur").tag(Role.employee)
              Text("Admin").tag(Role.admin)
            }
            if role == .employee {
              Picker("Équipe", selection: $team) {
                Text("Sans équipe").tag("")
                ForEach(data.teams) { Text($0.name).tag($0.id) }
              }
            }
          }
          Section {
            Button("Supprimer le compte", role: .destructive) { confirmDelete = true }
          }
        }
        ErrorText(text: error)
      }
      .navigationTitle("Modifier le compte")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } }
        if managerOf == nil {
          ToolbarItem(placement: .confirmationAction) {
            Button("Enregistrer") {
              Task {
                error = await act("Compte mis à jour") {
                  try await api.send("/api/admin/users", ["id": user.id, "role": role.rawValue, "teamId": role == .employee && !team.isEmpty ? team : nil], method: "PATCH")
                }
                if error == nil { dismiss() }
              }
            }
          }
        }
      }
      .confirmationDialog("Supprimer \(user.email) ?", isPresented: $confirmDelete, titleVisibility: .visible) {
        Button("Supprimer", role: .destructive) {
          Task {
            error = await act("Compte supprimé") { try await api.send("/api/admin/users", ["id": user.id], method: "DELETE") }
            if error == nil { dismiss() }
          }
        }
      } message: {
        Text("Ses réponses passées restent dans les moyennes, anonymes.")
      }
      .onAppear {
        role = user.role == .admin ? .admin : .employee
        team = user.teamId ?? ""
      }
    }
  }
}

private struct NewUserForm: View {
  @Environment(API.self) private var api
  @Environment(\.dismiss) private var dismiss
  let data: AdminData
  let act: Act
  @State private var email = ""
  @State private var password = NewUserForm.generate()
  @State private var role = Role.employee
  @State private var team = ""
  @State private var error: String?
  @State private var busy = false

  // Mot de passe provisoire lisible (sans 0/O ni 1/l), à transmettre à la personne.
  static func generate() -> String {
    String((0..<12).map { _ in "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789".randomElement()! })
  }

  var body: some View {
    NavigationStack {
      Form {
        TextField("E-mail", text: $email)
          .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        Section {
          HStack {
            Text(password).font(.body.monospaced()).textSelection(.enabled)
            Spacer()
            Button { password = Self.generate() } label: { Image(systemName: "arrow.clockwise") }
            Button { UIPasteboard.general.string = password } label: { Image(systemName: "doc.on.doc") }
          }
        } header: { Text("Mot de passe provisoire") } footer: { Text("À transmettre à la personne : elle pourra le changer.") }
        Picker("Rôle", selection: $role) {
          Text("Collaborateur").tag(Role.employee)
          Text("Admin").tag(Role.admin)
        }
        if role == .employee {
          Picker("Équipe", selection: $team) {
            Text("Sans équipe").tag("")
            ForEach(data.teams) { Text($0.name).tag($0.id) }
          }
        }
        ErrorText(text: error)
      }
      .navigationTitle("Nouveau compte")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Créer") {
            busy = true
            Task {
              error = await act("Compte créé") {
                try await api.send("/api/admin/users", ["email": email.trimmingCharacters(in: .whitespaces).lowercased(), "password": password,
                                                         "role": role.rawValue, "teamId": role == .employee && !team.isEmpty ? team : nil])
              }
              busy = false
              if error == nil { dismiss() }
            }
          }
          .disabled(!email.contains("@") || busy)
        }
      }
    }
  }
}

// MARK: Sujets

private struct TagsTab: View {
  @Environment(API.self) private var api
  let data: AdminData
  let act: Act
  @State private var renaming: AdminTag?
  @State private var adding = false
  @State private var label = ""
  @State private var error: String?

  var body: some View {
    List {
      if let error { Text(error).foregroundStyle(Palette.rose) }
      Section {
        ForEach(data.tags) { t in
          Button {
            label = t.label
            renaming = t
          } label: {
            HStack {
              Text(t.label)
              Spacer()
              Text("\(t.uses) citation\(t.uses > 1 ? "s" : "")").font(.caption).foregroundStyle(Palette.muted)
            }
          }
          .foregroundStyle(.primary)
        }
      } footer: {
        Text("Les sujets proposés dans le questionnaire. Touche un sujet pour le renommer ; citations sur 4 semaines.")
      }
    }
    .navigationTitle("Sujets")
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        Button {
          label = ""
          adding = true
        } label: { Label("Nouveau sujet", systemImage: "plus") }
      }
    }
    .alert("Renommer le sujet", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
      TextField("Libellé", text: $label)
      Button("Annuler", role: .cancel) {}
      Button("Enregistrer") { save(id: renaming?.id, ok: "Sujet renommé") }
    }
    .alert("Nouveau sujet", isPresented: $adding) {
      TextField("Ex. Formation", text: $label)
      Button("Annuler", role: .cancel) {}
      Button("Ajouter") { save(id: nil, ok: "Sujet ajouté") }
    }
  }

  private func save(id: Int?, ok: String) {
    let text = label.trimmingCharacters(in: .whitespaces)
    guard !text.isEmpty else { return }
    Task { error = await act(ok) { try await api.send("/api/admin/tags", ["id": id, "label": String(text.prefix(40))]) } }
  }
}
