import Charts
import SwiftUI

// Espace manager : pronostic sur la matrice, puis le Miroir (semaines closes uniquement).
struct MirrorScreen: View {
  @Environment(API.self) private var api
  @State private var mirror: Mirror?
  @State private var error: String?

  var body: some View {
    NavigationStack {
      Group {
        if let mirror, !mirror.needsPrediction {
          MirrorView(mirror: mirror)
        } else if mirror?.needsPrediction == true {
          ForecastView { Task { await load() } }
        } else {
          VStack(spacing: 16) {
            if let error {
              Text(error).foregroundStyle(Palette.muted).multilineTextAlignment(.center)
              Button("Réessayer") { Task { await load() } }.buttonStyle(GhostButton())
            } else { ProgressView() }
          }
          .padding(32).frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
      .background(Palette.page)
      .navigationTitle(mirror?.needsPrediction == false ? "Le Miroir" : "Espace manager")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) { Menu { LogoutButton() } label: { Image(systemName: "person.crop.circle") } }
        if let mirror, let weeks = mirror.weeks {
          ToolbarItem(placement: .topBarTrailing) {
            ShareLink(item: csv([["Semaine du", "Pronostic", "Moral équipe", "Plaisir", "Énergie", "Impact", "Réponses", "Écart"]] + weeks.map { w in
              [w.weekStart] + [w.prediction, w.teamAvg, w.pleasure, w.energy, w.impact].map { $0.map(fmt) ?? "" } + [w.responses.map(String.init) ?? "", w.gap.map(fmt) ?? ""]
            }), preview: SharePreview("moodly-miroir.csv")) { Image(systemName: "square.and.arrow.up") }
          }
        }
      }
      .refreshable { await load() }
    }
    .task { await load() }
  }

  private func load() async {
    error = nil
    do { mirror = try await api.get("/api/mirror?weeks=8") } catch { self.error = error.localizedDescription }
  }
}

// MARK: Pronostic

struct ForecastView: View {
  @Environment(API.self) private var api
  let onDone: () -> Void
  @State private var point: Axes?
  @State private var impact: Int?
  @State private var busy = false
  @State private var error: String?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("Avant de voir les résultats…").font(.display(28))
        Text("Où places-tu ton équipe cette semaine ? Pose-la sur la matrice : le plaisir qu'elle prend au travail et son énergie. Lundi, une fois la semaine close, tu verras où elle s'est placée elle-même.")
          .foregroundStyle(Palette.muted)
        MatrixInput(point: $point, team: true)
        VStack(alignment: .leading, spacing: 10) {
          Text("Et selon toi, se sent-elle utile ?").font(.headline)
          ForEach(0..<5, id: \.self) { v in Choice(label: Q.useful[v], number: v + 1, selected: impact == v + 1) { impact = v + 1 } }
        }
        Note(text: "Un seul pronostic par semaine, non modifiable : c'est ce qui rend la comparaison honnête.")
        ErrorText(text: error)
        Button(busy ? "Révélation…" : "Révéler le Miroir", action: send)
          .buttonStyle(PrimaryButton(dark: true))
          .disabled(point == nil || impact == nil || busy)
      }
      .padding(20)
    }
  }

  private func send() {
    guard let point, let impact else { return }
    busy = true
    Task {
      do {
        try await api.send("/api/predictions", ["pleasure": Int(point.pleasure), "energy": Int(point.energy), "impact": impact])
        onDone()
      } catch let e as APIError where e.status == 409 {
        onDone()
      } catch {
        self.error = error.localizedDescription
      }
      busy = false
    }
  }
}

// MARK: Le Miroir

private let weather: [(min: Double, icon: String, color: Color, label: String)] = [
  (4.2, "sun.max.fill", Color(hex: 0xd97706), "Grand soleil"),
  (3.4, "cloud.sun.fill", Color(hex: 0xd97706), "Éclaircies"),
  (2.6, "cloud.fill", Color(hex: 0x64748b), "Nuageux"),
  (1.8, "cloud.rain.fill", Color(hex: 0x2563eb), "Pluie"),
  (0, "cloud.bolt.fill", Color(hex: 0xbe123c), "Orage"),
]

// Justesse du regard, de 0 à 100 % : 100 si le pronostic tombe pile sur l'équipe, 0 à 4 points d'écart partout.
private func accuracy(_ w: Week) -> Int? {
  guard let f = w.forecast, let p = w.point else { return nil }
  return Int((100 * (1 - (abs(f.pleasure - p.pleasure) + abs(f.energy - p.energy) + abs(f.impact - p.impact)) / 3 / 4)).rounded())
}

struct MirrorView: View {
  let mirror: Mirror

  var body: some View {
    let weeks = mirror.weeks ?? []
    let last = mirror.last
    let row = last.flatMap { l in weeks.first { $0.weekStart == l.weekStart } }
    let gap = row?.gap
    let blind = gap.map { abs($0) > 1.5 } ?? false
    let closed = weeks.filter { $0.teamAvg != nil }
    let judged = weeks.filter { accuracy($0) != nil }
    let accNow = judged.last.flatMap(accuracy)
    let accBefore = judged.count > 1 ? accuracy(judged[judged.count - 2]) : nil

    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        if let last {
          let w = weather.first { last.teamAvg >= $0.min }!
          HStack(spacing: 16) {
            Image(systemName: w.icon).font(.system(size: 34)).foregroundStyle(w.color)
              .frame(width: 60, height: 60).background(.white, in: RoundedRectangle(cornerRadius: 16))
            VStack(alignment: .leading, spacing: 4) {
              Text("Météo de l'équipe : \(w.label)").font(.display(20))
              let delta = closed.count > 1 ? closed[closed.count - 1].teamAvg! - closed[closed.count - 2].teamAvg! : 0
              (Text("Semaine du \(Day.long(last.weekStart)) : ")
                + (row?.prediction.map { Text("tu pensais ") + Text(fmt($0)).bold().foregroundColor(Palette.forecast) + Text(" · ") } ?? Text(""))
                + Text("l'équipe était à ") + Text(fmt(last.teamAvg)).bold().foregroundColor(Palette.team) + Text(" / 5")
                + Text(abs(delta) >= 0.05 ? " (\(signed(delta)) sur une semaine)" : ""))
                .font(.subheadline).foregroundStyle(Palette.muted)
            }
          }
          .card(Palette.primarySoft)
        } else {
          Note(text: "Aucune semaine close avec au moins 5 réponses pour l'instant : les résultats apparaîtront le lundi qui suit.")
        }

        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
          Tile(title: "Justesse de ton regard\(blind ? " · angle mort" : "")", value: accNow.map { "\($0) %" } ?? "—",
               sub: accNow.flatMap { n in accBefore.map { b in n == b ? "semaine dernière" : "\(n > b ? "+" : "−")\(abs(n - b)) pts sur une semaine" } } ?? "semaine dernière",
               fill: blind ? Palette.roseSoft : Palette.soft)
          Tile(title: "Participation", value: last.flatMap { l in mirror.teamSize.map { pct(Double(l.responses) / Double(max(1, $0))) } } ?? "—", sub: "semaine dernière")
        }
        if let current = mirror.current {
          Tile(title: "Cette semaine · questionnaire jeudi et vendredi", value: "\(current.responses) réponse\(current.responses > 1 ? "s" : "") sur \(mirror.teamSize ?? 0)",
               sub: "Résultats lundi, une fois la semaine close, s'il y a au moins 5 réponses.")
        }

        MirrorChart(weeks: weeks).card()

        if let last {
          TeamMatrixCard(last: last, weeks: weeks, forecast: row?.forecast).card()
        }

        if blind, let gap {
          Label {
            VStack(alignment: .leading, spacing: 4) {
              Text("Angle mort détecté").font(.headline).foregroundStyle(Palette.rose)
              Text("La semaine dernière, ton équipe allait \(gap > 0 ? "moins bien" : "mieux") que tu ne le pensais.\(gap > 0 ? row?.dominantTag.map { " Sujet dominant : \($0)." } ?? "" : "")")
            }
          } icon: { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Palette.rose) }
          .card(Palette.roseSoft)
        } else if gap != nil {
          Label("Ta perception était proche du ressenti de l'équipe la semaine dernière.", systemImage: "checkmark")
            .foregroundStyle(Palette.green).card(Palette.greenSoft)
        }

        TeamVotes().card()
        if !judged.isEmpty { AccuracyCard(weeks: judged).card() }
        if let last { FactorsCard(last: last).card() }
        if let last { BenchmarkCard(last: last, teamSize: mirror.teamSize ?? 0) }
      }
      .padding(20)
    }
  }
}

// Moral de l'équipe (semaines closes) face au pronostic, semaine par semaine.
private struct MirrorChart: View {
  let weeks: [Week]
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      SectionTitle(title: "Semaine après semaine", sub: "Moral de l'équipe face à ton pronostic, de 1 à 5")
      Chart {
        ForEach(weeks) { w in
          if let v = w.teamAvg {
            LineMark(x: .value("Semaine", Day.short(w.weekStart)), y: .value("Moral", v), series: .value("Série", "Équipe"))
              .foregroundStyle(Palette.team).lineStyle(StrokeStyle(lineWidth: 3)).symbol(.circle)
          }
          if let p = w.prediction {
            LineMark(x: .value("Semaine", Day.short(w.weekStart)), y: .value("Moral", p), series: .value("Série", "Pronostic"))
              .foregroundStyle(Palette.forecast).lineStyle(StrokeStyle(lineWidth: 2, dash: [6, 4]))
          }
        }
      }
      .chartYScale(domain: 1...5)
      .chartForegroundStyleScale(["Équipe": Palette.team, "Pronostic": Palette.forecast])
      .frame(height: 220)
    }
  }
}

private struct TeamMatrixCard: View {
  let last: LastWeek
  let weeks: [Week]
  let forecast: Axes?

  var body: some View {
    let path = weeks.compactMap { w in w.point.map { (w.weekStart, $0) } }
    var marks = path.enumerated().map { i, item in
      Mark(p: item.1, label: i == path.count - 1 ? "Équipe" : i == 0 ? Day.short(item.0) : nil, color: Palette.team)
    }
    if let forecast { marks.append(Mark(p: forecast, label: "Ton pronostic", color: Palette.forecast, strong: true, up: true)) }
    let middle = Int((Double(last.energyZones?["middle"] ?? 0) / Double(last.responses) * 100).rounded())

    return VStack(alignment: .leading, spacing: 14) {
      SectionTitle(title: "Matrice de l'équipe", sub: "Ton pronostic face à ses réponses")
      if let forecast {
        let a = Zone.of(forecast), b = Zone.of(last.point)
        Verdict(text: Text(a == b ? "Tu voyais ton équipe « \(a.label) » : c'est bien là qu'elle s'est placée."
                                  : "Tu voyais ton équipe « \(a.label) », elle s'est placée « \(b.label) »."))
      }
      MatrixPlot(marks: marks, trail: true, corners: zoneShares(last.energyZones, total: last.responses))
      Usefulness(rows: [("Équipe", last.impact, Palette.team)] + (forecast.map { [("Ton pronostic", $0.impact, Palette.forecast)] } ?? []))
      Text("Chaque point est une semaine close, le plus marqué la plus récente. Pourcentages : semaine du \(Day.short(last.weekStart)) (\(last.responses) réponses), dont \(middle) % « mitigé ».\(last.tags.isEmpty ? "" : " Sujets les plus cités : \(last.tags.joined(separator: " · ")).")")
        .font(.footnote).foregroundStyle(Palette.muted)
    }
  }
}

// Ce que l'équipe demande : vote de fin de questionnaire, dernière semaine close (5 votes minimum).
private struct TeamVotes: View {
  @Environment(API.self) private var api
  @State private var wishes: [Wishes]?

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      let latest = wishes?.last
      SectionTitle(title: "Ce que ton équipe demande", sub: latest.map { "\($0.votes) votes, semaine du \(Day.short($0.weekStart))" } ?? "Vote de fin de questionnaire")
      if let latest {
        let prev = wishes?.first { $0.weekStart == Day.add(latest.weekStart, days: -7) }
        let ranked = latest.wishes.sorted { a, b in a.key == "rien" ? false : b.key == "rien" ? true : a.value > b.value }
        ForEach(Array(ranked.enumerated()), id: \.element.key) { i, item in
          VStack(alignment: .leading, spacing: 2) {
            BarRow(label: Q.asks[item.key] ?? item.key, value: Double(item.value), max: Double(latest.votes),
                   color: item.key == "rien" ? Palette.green : i == 0 ? Palette.primary : Palette.primary.opacity(0.5),
                   text: pct(Double(item.value) / Double(latest.votes)))
              .fontWeight(i == 0 && item.key != "rien" ? .bold : .regular)
            if let prev {
              let was = prev.wishes[item.key] ?? 0
              if was != item.value {
                Text("\(item.value > was ? "+" : "−")\(abs(item.value - was)) vote\(abs(item.value - was) > 1 ? "s" : "") par rapport à la semaine d'avant")
                  .font(.caption2).foregroundStyle(Palette.muted)
              }
            }
          }
        }
      } else if wishes != nil {
        Note(text: "Les votes de l'équipe s'affichent ici dès qu'une semaine close compte 5 votes.")
      } else {
        ProgressView()
      }
      Text("Chaque collaborateur choisit, anonymement, ce qui l'aiderait le plus.").font(.footnote).foregroundStyle(Palette.muted)
    }
    .task { wishes = (try? await api.get("/api/wishes?weeks=2")) ?? [] }
  }
}

// Diverge autour du centre : vers la droite si positif (vert), vers la gauche sinon (rose).
private struct Diverge: View {
  let gap: Double
  var scale: Double = 2
  var body: some View {
    GeometryReader { g in
      let half = g.size.width / 2
      let w = min(abs(gap) / scale, 1) * half
      ZStack(alignment: .leading) {
        Capsule().fill(Palette.soft)
        Capsule().fill(gap >= 0 ? Palette.green : Color(hex: 0xe11d48)).frame(width: w).offset(x: gap >= 0 ? half : half - w)
        Rectangle().fill(Palette.muted.opacity(0.5)).frame(width: 2).offset(x: half - 1)
      }
    }
    .frame(height: 10)
  }
}

private struct AccuracyCard: View {
  let weeks: [Week]
  var body: some View {
    let scores = weeks.map { (week: $0.weekStart, v: accuracy($0)!) }
    let now = scores.last!, first = scores.first!
    let recent = weeks.suffix(4)
    // Biais moyen par axe sur les dernières semaines : positif, le manager voit plus haut que l'équipe.
    let bias = { (gap: (Week) -> Double) -> Double in recent.map(gap).reduce(0, +) / Double(recent.count) }
    let axes: [(label: String, gap: Double, tip: String)] = [
      ("Plaisir", bias { $0.forecast!.pleasure - $0.pleasure! }, "Demande en réunion ce qui a plu et ce qui a pesé cette semaine."),
      ("Énergie", bias { $0.forecast!.energy - $0.energy! }, "Regarde la charge réelle : heures, urgences, messages hors horaires."),
      ("Utilité", bias { $0.forecast!.impact - $0.impact! }, "Partage les retours sur le travail de l'équipe et ce qu'il a permis."),
    ]
    let blind = axes.max { abs($0.gap) < abs($1.gap) }!
    let color = { (v: Int) in v >= 85 ? Palette.green : v >= 70 ? Color(hex: 0xf59e0b) : Color(hex: 0xe11d48) }

    VStack(alignment: .leading, spacing: 16) {
      SectionTitle(title: "La justesse de ton regard", sub: "Ton pronostic sur la matrice face à l'équipe")
      HStack(spacing: 14) {
        Text("\(now.v) %").font(.display(40)).foregroundStyle(color(now.v))
        VStack(alignment: .leading, spacing: 4) {
          Text("Semaine du \(Day.short(now.week))").font(.footnote).foregroundStyle(Palette.muted)
          if scores.count > 1, now.v != first.v {
            Pill(text: "\(now.v > first.v ? "+" : "−")\(abs(now.v - first.v)) pts depuis le \(Day.short(first.week))",
                 fg: now.v > first.v ? Palette.green : Palette.rose, bg: now.v > first.v ? Palette.greenSoft : Palette.roseSoft)
          }
        }
      }
      Chart(scores, id: \.week) { s in
        BarMark(x: .value("Semaine", Day.short(s.week)), y: .value("Justesse", s.v))
          .foregroundStyle(color(s.v)).cornerRadius(6)
          .annotation(position: .top) { Text("\(s.v)").font(.caption2.bold()).foregroundStyle(Palette.muted) }
      }
      .chartYScale(domain: 0...100)
      .chartYAxis(.hidden)
      .frame(height: 150)

      VStack(alignment: .leading, spacing: 10) {
        Text("Axe par axe · \(recent.count) dernières semaines").font(.subheadline.weight(.semibold))
        ForEach(axes, id: \.label) { a in
          HStack(spacing: 10) {
            Text(a.label).font(.subheadline).frame(width: 64, alignment: .leading)
            Diverge(gap: a.gap, scale: 4)
            Text(abs(a.gap) < 0.5 ? "juste" : a.gap > 0 ? "surestimé de \(fmt(a.gap))" : "sous-estimé de \(fmt(-a.gap))")
              .font(.caption).foregroundStyle(Palette.muted).frame(width: 118, alignment: .leading)
          }
        }
      }
      Verdict(text: abs(blind.gap) >= 0.5
        ? Text("Ton angle mort en ce moment : ") + Text(blind.label.lowercased()).bold() + Text(". Tu le vois \(fmt(abs(blind.gap))) pt \(blind.gap > 0 ? "plus haut" : "plus bas") que ce que dit l'équipe. \(blind.tip)")
        : Text("Ces dernières semaines, ton regard est juste sur les trois axes : continue à le confronter chaque semaine."))
    }
  }
}

private struct FactorsCard: View {
  let last: LastWeek
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      SectionTitle(title: "Ce qui pèse et ce qui porte", sub: "Semaine du \(Day.long(last.weekStart)) · notes de 1 à 5, 5 = favorable")
      if let factors = last.factors {
        ForEach(Q.factors.sorted { factors[$0.key]! < factors[$1.key]! }, id: \.key) { f in
          BarRow(label: f.label, value: factors[f.key]!, color: tone(factors[f.key]!))
        }
      } else {
        Note(text: "Facteurs affichés à partir de 5 questionnaires complets.")
      }
      if let t = last.trend {
        let total = Double(max(1, t.better + t.same + t.worse))
        Text("Par rapport à la semaine d'avant").font(.subheadline.weight(.semibold))
        HStack(spacing: 6) {
          Pill(text: "\(pct(Double(t.better) / total)) mieux", fg: Palette.green, bg: Palette.greenSoft)
          Pill(text: "\(pct(Double(t.same) / total)) pareille")
          Pill(text: "\(pct(Double(t.worse) / total)) moins bien", fg: Palette.rose, bg: Palette.roseSoft)
        }
      }
      if !last.tags.isEmpty {
        Text("Sujets les plus cités").font(.subheadline.weight(.semibold))
        Flow { ForEach(last.tags, id: \.self) { Pill(text: $0) } }
      }
    }
  }
}

// Ton équipe face à l'entreprise, sur la même semaine close.
private struct BenchmarkCard: View {
  @Environment(API.self) private var api
  let last: LastWeek
  let teamSize: Int
  @State private var b: Benchmark?

  var body: some View {
    // VStack toujours présent : la tâche de chargement part même quand il n'y a rien à afficher.
    VStack {
      if let b, b.weekStart == last.weekStart, b.teams >= 2 {
        let rows = (last.factors != nil && b.factors != nil) ? Q.factors.map { f in
          (label: f.label, team: last.factors![f.key]!, company: b.factors![f.key]!, gap: last.factors![f.key]! - b.factors![f.key]!)
        }.sorted { $0.gap < $1.gap } : []
        VStack(alignment: .leading, spacing: 14) {
          SectionTitle(title: "Ton équipe face à l'entreprise", sub: "Semaine du \(Day.long(b.weekStart)), \(b.teams) équipes, \(b.responses) réponses")
          MatrixPlot(marks: [
            Mark(p: b.point, label: "Entreprise", color: Palette.company, strong: true, up: true),
            Mark(p: last.point, label: "Ton équipe", color: Palette.team, strong: true),
          ])
          Usefulness(rows: [("Ton équipe", last.impact, Palette.team), ("Entreprise", b.impact, Palette.company)])
          HStack(spacing: 12) {
            Tile(title: "Moral", value: fmt(last.teamAvg), sub: "\(signed(last.teamAvg - b.teamAvg)) face à l'entreprise (\(fmt(b.teamAvg)))")
            Tile(title: "Participation", value: pct(teamSize > 0 ? Double(last.responses) / Double(teamSize) : nil), sub: "\(pct(b.participation)) dans l'entreprise")
          }
          if !rows.isEmpty {
            Text("Facteur par facteur").font(.subheadline.weight(.semibold))
            ForEach(rows, id: \.label) { r in
              VStack(alignment: .leading, spacing: 4) {
                HStack {
                  Text(r.label).font(.subheadline)
                  Spacer()
                  Text(signed(r.gap)).font(.subheadline.bold().monospacedDigit())
                  Text("· \(fmt(r.team)) contre \(fmt(r.company))").font(.caption).foregroundStyle(Palette.muted)
                }
                Diverge(gap: r.gap)
              }
            }
            let worst = rows.first!, best = rows.last!
            Verdict(text: (worst.gap <= -0.3
              ? Text("Là où ton équipe décroche le plus : ") + Text(worst.label.lowercased()).bold() + Text(" (\(fmt(worst.team)) contre \(fmt(worst.company)) dans l'entreprise).")
              : Text("Ton équipe n'est en retrait sur aucun facteur."))
              + (best.gap >= 0.3 ? Text(" Son point fort : ") + Text(best.label.lowercased()).bold() + Text(" (\(signed(best.gap)))."): Text("")))
          }
          Text("Moyennes de toutes les équipes ayant au moins 5 réponses cette semaine-là : aucune réponse individuelle n'est visible.")
            .font(.footnote).foregroundStyle(Palette.muted)
        }
        .card()
      }
    }
    .task { b = try? await api.getOptional("/api/benchmark") }
  }
}
