import SwiftUI

struct EmployeeHome: View {
  var body: some View {
    TabView {
      QuestionnaireScreen().tabItem { Label("Cette semaine", systemImage: "square.and.pencil") }
      ParcoursScreen().tabItem { Label("Mon parcours", systemImage: "chart.xyaxis.line") }
    }
  }
}

struct LogoutButton: View {
  @Environment(API.self) private var api
  var body: some View {
    Button { Task { await api.logout() } } label: { Label("Se déconnecter", systemImage: "rectangle.portrait.and.arrow.right") }
  }
}

// MARK: Questionnaire, une question par écran

private enum Kind: Equatable { case agree(Int), trend, tags, wish, matrix, useful }
private let STEPS: [(kind: Kind, short: String, group: String)] =
  Q.short.enumerated().map { (Kind.agree($0.offset), $0.element, "Ta semaine") } + [
    (.trend, "Comparée à la précédente", "Le bilan"),
    (.tags, "Ce qui a pesé", "Le bilan"),
    (.wish, "Ce qui t'aiderait", "Le bilan"),
    (.matrix, "Ta place sur la matrice", "Ton ressenti"),
    (.useful, "Sentiment d'utilité", "Ton ressenti"),
  ]

struct QuestionnaireScreen: View {
  @Environment(API.self) private var api
  private enum Phase { case loading, onboarding, closed(String), questions, done }
  @State private var phase = Phase.loading
  @State private var error: String?
  @State private var tags: [Tag] = []
  @State private var answers: [Int?] = Array(repeating: nil, count: 9)
  @State private var trend: Int?
  @State private var picked: [Int] = []
  @State private var wish: Int?
  @State private var point: Axes?
  @State private var impact: Int?
  @State private var q = 0
  @State private var busy = false
  @State private var showList = false

  var body: some View {
    NavigationStack {
      Group {
        switch phase {
        case .loading:
          VStack(spacing: 16) {
            if let error {
              Text(error).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
              Button("Réessayer") { Task { await load() } }.buttonStyle(GhostButton())
            } else { ProgressView() }
          }
          .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
        case .onboarding: onboarding
        case .closed(let opensOn): closed(opensOn)
        case .questions: wizard
        case .done:
          ScrollView { DoneView(history: History.read(api.me?.id ?? "")).padding(20) }
        }
      }
      .background(Palette.page)
      .navigationTitle("Cette semaine")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) { Menu { LogoutButton() } label: { Image(systemName: "person.crop.circle") } }
        if case .questions = phase {
          ToolbarItem(placement: .topBarTrailing) {
            Button { showList = true } label: { Label("Questions", systemImage: "list.bullet") }
          }
        }
      }
    }
    .task { await load() }
  }

  private func load() async {
    error = nil
    do {
      async let week: WeekStatus = api.get("/api/moods/week")
      async let list: [Tag] = api.get("/api/tags")
      let (w, t) = try await (week, list)
      tags = t
      phase = w.submitted ? .done : !w.open ? .closed(w.opensOn) : UserDefaults.standard.bool(forKey: "onboarding") ? .questions : .onboarding
    } catch {
      self.error = error.localizedDescription
    }
  }

  // MARK: Accueil et semaine fermée

  private var onboarding: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Label("100 % anonyme", systemImage: "checkmark.shield.fill").font(.footnote.bold()).foregroundStyle(Palette.green)
        Text("Ta réponse reste anonyme. Vraiment.").font(.display(28))
        ForEach([
          "Ta réponse est enregistrée sans ton identité : seulement tes réponses, ton point sur la matrice, des sujets et la semaine.",
          "La base de données refuse toute lecture individuelle, même à ton manager.",
          "Ton manager ne voit qu'une moyenne d'équipe, une fois la semaine close et à partir de 5 réponses.",
          "Pas de commentaire libre, pas de localisation : rien qui permette de te reconnaître.",
        ], id: \.self) { line in
          Label { Text(line) } icon: { Image(systemName: "checkmark").foregroundStyle(Palette.primary) }
        }
        Note(text: "Une fois par semaine, le jeudi ou le vendredi : 2 minutes sur ta semaine de travail.")
        Button("J'ai compris") {
          UserDefaults.standard.set(true, forKey: "onboarding")
          phase = .questions
        }
        .buttonStyle(PrimaryButton())
      }
      .padding(20)
    }
  }

  private func closed(_ opensOn: String) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Image(systemName: "calendar").font(.system(size: 40)).foregroundStyle(Palette.primary)
        Text("Rendez-vous \(Day.weekday(opensOn))").font(.display(28))
        Text("Le questionnaire de la semaine est ouvert le jeudi et le vendredi : 2 minutes pour faire le point sur ta semaine de travail.")
          .foregroundStyle(Palette.muted)
        ReminderToggle().card()
        Note(text: "En attendant, ton parcours des semaines passées est dans l'onglet « Mon parcours ».")
      }
      .padding(20)
    }
  }

  // MARK: Questions

  private func answered(_ k: Int) -> Bool {
    switch STEPS[k].kind {
    case .agree(let i): answers[i] != nil
    case .trend: trend != nil
    case .tags: !picked.isEmpty
    case .wish: wish != nil
    case .matrix: point != nil
    case .useful: impact != nil
    }
  }

  private var firstOpen: Int? { STEPS.indices.first { !answered($0) } }

  private var wizard: some View {
    let step = STEPS[q]
    let done = STEPS.indices.filter(answered).count
    return ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        VStack(alignment: .leading, spacing: 6) {
          ProgressView(value: Double(done), total: Double(STEPS.count)).tint(Palette.primary)
          Text("\(done) sur \(STEPS.count) · environ 2 minutes").font(.caption).foregroundStyle(Palette.muted)
        }
        Eyebrow(text: "Question \(q + 1) sur \(STEPS.count) · \(step.group)")
        question(step.kind).id(q).transition(.opacity)
        ErrorText(text: error)
        Note(text: "Ton manager ne verra jamais ta réponse individuelle.")
      }
      .padding(20)
    }
    .animation(.easeInOut(duration: 0.2), value: q)
    .safeAreaInset(edge: .bottom) {
      HStack {
        Button("← Précédente") { q -= 1 }.disabled(q == 0).opacity(q == 0 ? 0 : 1)
        Spacer()
        if q == STEPS.count - 1 {
          Button(busy ? "Envoi…" : "Voir ce que disent mes réponses", action: send)
            .buttonStyle(PrimaryButton()).fixedSize()
            .disabled(firstOpen != nil || busy)
        } else {
          Button("Suivante →") { q += 1 }.buttonStyle(PrimaryButton()).frame(width: 150).disabled(!answered(q))
        }
      }
      .padding(.horizontal, 20).padding(.vertical, 10)
      .background(.bar)
    }
    .sheet(isPresented: $showList) { stepList }
  }

  @ViewBuilder private func question(_ kind: Kind) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      switch kind {
      case .agree(let i):
        VStack(alignment: .leading, spacing: 6) {
          Text("Cette semaine…").italic().foregroundStyle(Palette.muted)
          Text(Q.statements[i]).font(.display(26))
        }
        ForEach(0..<5, id: \.self) { v in
          Choice(label: Q.agree[v], number: v + 1, selected: answers[i] == v + 1) { answers[i] = v + 1 }
        }
      case .trend:
        Text("Par rapport à la semaine dernière, ta semaine a été…").font(.display(26))
        ForEach(Q.trends, id: \.value) { t in Choice(label: t.label, selected: trend == t.value) { trend = t.value } }
      case .tags:
        Text("Qu'est-ce qui a le plus pesé cette semaine, en bien ou en mal ?").font(.display(26))
        Text("Choisis 1 à 3 sujets.").foregroundStyle(Palette.muted)
        Flow {
          ForEach(tags) { t in
            Chip(label: t.label, selected: picked.contains(t.id)) {
              if let i = picked.firstIndex(of: t.id) { picked.remove(at: i) } else if picked.count < 3 { picked.append(t.id) }
            }
          }
        }
      case .wish:
        Text("Qu'est-ce qui t'aiderait le plus en ce moment ?").font(.display(26))
        Text("Ton choix compte, anonymement, dans le vote de l'équipe : ton manager voit ce que l'équipe demande le plus.")
          .foregroundStyle(Palette.muted)
        ForEach(Q.wishes.indices, id: \.self) { i in Choice(label: Q.wishes[i].label, selected: wish == i) { wish = i } }
      case .matrix:
        Text("Et toi, où te situes-tu cette semaine ?").font(.display(26))
        Text("Avant de voir ce que disent tes réponses, place-toi toi-même : le plaisir que tu as pris au travail, et ton énergie.")
          .foregroundStyle(Palette.muted)
        MatrixInput(point: $point)
      case .useful:
        Text("As-tu eu le sentiment d'être utile cette semaine ?").font(.display(26))
        ForEach(0..<5, id: \.self) { v in Choice(label: Q.useful[v], number: v + 1, selected: impact == v + 1) { impact = v + 1 } }
        if let firstOpen, impact != nil { Text("Il manque une réponse : « \(STEPS[firstOpen].short) ».").font(.footnote).foregroundStyle(Palette.muted) }
      }
    }
  }

  private var stepList: some View {
    NavigationStack {
      List {
        ForEach(["Ta semaine", "Le bilan", "Ton ressenti"], id: \.self) { group in
          Section(group) {
            ForEach(STEPS.indices.filter { STEPS[$0].group == group }, id: \.self) { k in
              Button {
                q = k
                showList = false
              } label: {
                HStack(spacing: 12) {
                  Image(systemName: answered(k) ? "checkmark.circle.fill" : k == q ? "\(k + 1).circle.fill" : "\(k + 1).circle")
                    .foregroundStyle(answered(k) ? Palette.green : Palette.primary)
                  Text(STEPS[k].short).foregroundStyle(k == q ? Palette.primary : .primary).fontWeight(k == q ? .semibold : .regular)
                }
              }
              .disabled(!(firstOpen.map { k <= $0 } ?? true))
            }
          }
        }
      }
      .navigationTitle("Les questions")
      .navigationBarTitleDisplayMode(.inline)
    }
    .presentationDetents([.medium, .large])
  }

  private func send() {
    guard let point, let impact, let trend, let wish else { return }
    busy = true
    error = nil
    let all = answers.compactMap { $0 }
    Task {
      do {
        try await api.send("/api/moods", [
          "pleasure": Int(point.pleasure), "energy": Int(point.energy), "impact": impact,
          "answers": all, "trend": trend, "tagIds": picked, "wish": Q.wishes[wish].key,
        ])
        save(Entry(pleasure: point.pleasure, energy: point.energy, impact: Double(impact), answers: all))
      } catch let e as APIError where e.status == 409 {
        phase = .done
      } catch {
        self.error = error.localizedDescription
      }
      busy = false
    }
  }

  private func save(_ entry: Entry) {
    guard let uid = api.me?.id else { return }
    var h = History.read(uid)
    h[Day.monday(Day.today())] = entry
    History.save(uid, h)
    phase = .done
  }
}

// MARK: Après l'envoi

struct DoneView: View {
  let history: [String: Entry]

  var body: some View {
    let today = Day.today()
    let entry = history[Day.monday(today)]
    let streak = History.streak(history, today)
    VStack(alignment: .leading, spacing: 20) {
      HStack(alignment: .top, spacing: 14) {
        Image(systemName: "checkmark.circle.fill").font(.system(size: 44)).foregroundStyle(Palette.green)
        VStack(alignment: .leading, spacing: 6) {
          Text(entry?.answers != nil ? "Voici ce que disent tes réponses" : "Merci, c'est noté pour cette semaine.").font(.display(24))
          Text("Envoyé, de façon anonyme. Ta réponse rejoindra les résultats de l'équipe lundi, une fois la semaine close et avec au moins 5 réponses. Rendez-vous jeudi prochain.")
            .font(.subheadline).foregroundStyle(Palette.muted)
        }
      }

      if let entry, let answers = entry.answers {
        let calc = Q.fromAnswers(answers)
        let factors = Q.factorsOf(answers).sorted { $0.value > $1.value }
        VStack(alignment: .leading, spacing: 12) {
          VStack(alignment: .leading, spacing: 2) {
            Text("Toi : \(Zone.of(entry.axes).label)").font(.headline)
            Text("Tes réponses : \(Zone.of(calc).label)").font(.subheadline).foregroundStyle(Palette.muted)
          }
          MatrixPlot(marks: [
            Mark(p: calc, label: "Tes réponses", color: Palette.primary, strong: true),
            Mark(p: entry.axes, label: "Toi", color: Palette.ink, strong: true, up: true),
          ])
          Usefulness(rows: [("Toi", entry.impact, Palette.ink), ("Tes réponses", calc.impact, Palette.primary)])
          Verdict(text: Text(Q.compareText(entry.axes, calc)))
          if let top = factors.first, let low = factors.last, top.value - low.value >= 1 {
            HStack(spacing: 12) {
              Tile(title: "Point d'appui", value: top.label, sub: "\(fmt(top.value)) / 5", fill: Palette.greenSoft)
              Tile(title: "Point de vigilance", value: low.label, sub: "\(fmt(low.value)) / 5", fill: Palette.amberSoft)
            }
          }
        }
        .card()

        if Q.needsHelp(entry.axes, answers) { HelpCard() }
      }

      if streak > 0 {
        VStack(alignment: .leading, spacing: 12) {
          HStack(spacing: 12) {
            Text("\(streak)").font(.display(34)).foregroundStyle(Palette.primary)
            Text(streak > 1 ? "semaines d'affilée. Continue comme ça !" : "semaine. C'est un début !")
          }
          WeekStrip(history: history, today: today)
          Text("Ton historique et ta comparaison restent sur cet appareil : ils ne sont jamais envoyés.")
            .font(.footnote).foregroundStyle(Palette.muted)
        }
        .card()
      }
    }
  }
}

struct HelpCard: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Ça n'a pas l'air facile en ce moment.").font(.display(19))
      Text("Tu n'as pas à gérer ça seul·e :")
      Text("• la **médecine du travail**, tenue au secret médical ;\n• une personne de confiance, au travail ou en dehors ;\n• en cas de détresse, le **3114** : gratuit, 24 h/24, 7 j/7.")
      Link("Appeler le 3114", destination: URL(string: "tel:3114")!).font(.subheadline.bold())
    }
    .font(.subheadline)
    .card(Palette.roseSoft)
  }
}

// 12 dernières semaines, colorées par zone.
struct WeekStrip: View {
  let history: [String: Entry]
  let today: String
  var body: some View {
    let weeks = Day.lastWeeks(today, 12)
    VStack(spacing: 4) {
      HStack(spacing: 4) {
        ForEach(weeks, id: \.self) { w in
          RoundedRectangle(cornerRadius: 4)
            .fill(history[w].map { Zone.of($0.axes).color } ?? Palette.line)
            .frame(height: 22)
        }
      }
      HStack {
        Text("il y a 12 semaines")
        Spacer()
        Text("cette semaine")
      }
      .font(.caption2).foregroundStyle(Palette.muted)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Ta zone sur 12 semaines : \(weeks.compactMap { history[$0].map { Zone.of($0.axes).label } }.joined(separator: ", "))")
  }
}

struct ReminderToggle: View {
  @State private var on = Reminder.on
  @State private var denied = false
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Toggle(isOn: Binding(get: { on }, set: { value in
        Task {
          let ok = await Reminder.set(value)
          on = ok
          denied = value && !ok
        }
      })) {
        Label("Me rappeler le jeudi à 10 h", systemImage: "bell")
      }
      .tint(Palette.primary)
      if denied { Text("Notifications refusées : autorise-les dans Réglages.").font(.footnote).foregroundStyle(Palette.rose) }
    }
  }
}

// MARK: Mon parcours (sur cet appareil uniquement)

struct ParcoursScreen: View {
  @Environment(API.self) private var api
  @State private var history: [String: Entry] = [:]
  private let order: [Zone] = [.enthusiasm, .serenity, .middle, .tension, .dejection]

  var body: some View {
    let today = Day.today()
    let weeks = Day.lastWeeks(today, 12)
    let answered = weeks.filter { history[$0] != nil }
    let counts = Dictionary(uniqueKeysWithValues: order.map { z in (z, answered.filter { Zone.of(history[$0]!.axes) == z }.count) })
    let top = order.max { counts[$0]! < counts[$1]! } ?? .middle
    let label = { (w: String) in w == Day.monday(today) ? "Cette semaine" : "Sem. du \(Day.short(w))" }
    let compared = answered.filter { history[$0]?.answers != nil }
    let moral = { (p: Axes) in (p.pleasure + p.energy + p.impact) / 3 }
    let gap = compared.isEmpty ? nil : compared.map { moral(history[$0]!.axes) - moral(Q.fromAnswers(history[$0]!.answers!)) }.reduce(0, +) / Double(compared.count)

    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 20) {
          Text("Ces données restent sur cet appareil : ni ton manager ni l'entreprise ne les voient.")
            .font(.subheadline).foregroundStyle(Palette.muted)

          if answered.isEmpty {
            VStack(spacing: 12) {
              Image(systemName: "chart.xyaxis.line").font(.largeTitle).foregroundStyle(Palette.primary)
              Text("Pas encore de réponse enregistrée sur cet appareil.").foregroundStyle(Palette.muted)
            }
            .frame(maxWidth: .infinity).card()
          } else {
            VStack(alignment: .leading, spacing: 12) {
              SectionTitle(title: "Ta trajectoire", sub: answered.count < 3 ? "Ton parcours se dessine semaine après semaine." : "Chaque point est une semaine ; le plus marqué est le plus récent.")
              MatrixPlot(marks: answered.enumerated().map { i, w in
                Mark(p: history[w]!.axes, label: i == answered.count - 1 ? label(w) : nil, color: Zone.of(history[w]!.axes).color)
              }, trail: true)
              Usefulness(rows: [("Moyenne", answered.map { history[$0]!.impact }.reduce(0, +) / Double(answered.count), Palette.primary)])
            }
            .card()

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
              Tile(title: "Réponses", value: "\(answered.count)", sub: "sur 12 semaines")
              let run = History.streak(history, today)
              Tile(title: "Série", value: "\(run)", sub: run > 1 ? "semaines d'affilée" : "semaine, c'est un début")
            }
            Tile(title: "Zone la plus fréquente · \(counts[top]!) semaine\(counts[top]! > 1 ? "s" : "") sur \(answered.count)",
                 value: top.label, sub: top.text, fill: top.color.opacity(0.3))
            if let gap {
              Tile(title: "Ton ressenti face à tes réponses · \(compared.count) semaine\(compared.count > 1 ? "s" : "")",
                   value: abs(gap) < 0.5 ? "Ils concordent" : gap > 0 ? "Tu te vois plus haut" : "Tu te vois plus bas",
                   sub: abs(gap) < 0.5 ? "Là où tu te places et ce que disent tes réponses se rejoignent." : "En moyenne \(fmt(abs(gap))) pt \(gap > 0 ? "au-dessus" : "en dessous") de ce que disent tes réponses.")
            }

            VStack(alignment: .leading, spacing: 12) {
              SectionTitle(title: "Répartition")
              ForEach(order, id: \.self) { z in
                BarRow(label: z.label, value: Double(counts[z]!), max: Double(max(1, counts.values.max() ?? 1)), color: z.color, text: "\(counts[z]!)")
              }
              SectionTitle(title: "Semaine par semaine")
              WeekStrip(history: history, today: today)
            }
            .card()

            ShareLink(item: csv([["Semaine du", "Plaisir", "Énergie", "Utilité", "Zone", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9", "Q10", "Q11"]] +
              history.keys.sorted().map { w in
                let e = history[w]!
                return [w, fmt(e.pleasure), fmt(e.energy), fmt(e.impact), Zone.of(e.axes).label] + (e.answers ?? []).map(String.init)
              }), preview: SharePreview("moodly-mon-parcours.csv")) {
              Label("Exporter mes données (CSV)", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(GhostButton())
          }

          ReminderToggle().card()
        }
        .padding(20)
      }
      .background(Palette.page)
      .navigationTitle("Mon parcours")
      .toolbar { ToolbarItem(placement: .topBarLeading) { Menu { LogoutButton() } label: { Image(systemName: "person.crop.circle") } } }
      .onAppear { history = History.read(api.me?.id ?? "") }
    }
  }
}
