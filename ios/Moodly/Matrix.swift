import SwiftUI

// Matrice du moral : plaisir en hauteur, énergie en largeur, de 1 à 5 (centre des cases).
private func spot(_ p: Axes, _ size: CGSize) -> CGPoint {
  CGPoint(x: (p.energy - 0.5) / 5 * size.width, y: (5.5 - p.pleasure) / 5 * size.height)
}

// Les 4 coins colorés, libellé de zone ou contenu libre (pourcentages).
private struct Quadrants: View {
  var corners: [Zone: String]? = nil
  var body: some View {
    VStack(spacing: 0) {
      HStack(spacing: 0) { cell(.serenity, .topLeading); cell(.enthusiasm, .topTrailing) }
      HStack(spacing: 0) { cell(.dejection, .bottomLeading); cell(.tension, .bottomTrailing) }
    }
    .overlay {
      Canvas { ctx, size in
        var lines = Path()
        lines.move(to: CGPoint(x: size.width / 2, y: 0)); lines.addLine(to: CGPoint(x: size.width / 2, y: size.height))
        lines.move(to: CGPoint(x: 0, y: size.height / 2)); lines.addLine(to: CGPoint(x: size.width, y: size.height / 2))
        ctx.stroke(lines, with: .color(Palette.ink.opacity(0.2)), lineWidth: 1.5)
        for i in 0..<5 { for j in 0..<5 {
          let c = CGPoint(x: (Double(i) + 0.5) / 5 * size.width, y: (Double(j) + 0.5) / 5 * size.height)
          ctx.fill(Path(ellipseIn: CGRect(x: c.x - 1.5, y: c.y - 1.5, width: 3, height: 3)), with: .color(Palette.ink.opacity(0.25)))
        } }
      }
      .allowsHitTesting(false)
    }
  }

  private func cell(_ z: Zone, _ a: Alignment) -> some View {
    ZStack(alignment: a) {
      Color.white
      z.color.opacity(0.4)
      VStack(alignment: a.horizontal == .leading ? .leading : .trailing, spacing: 0) {
        if let c = corners?[z] { Text(c).font(.display(19)).monospacedDigit() }
        Text(z.label).font(.caption2.weight(.bold))
      }
      .padding(8)
    }
  }
}

private struct Frame<Content: View>: View {
  @ViewBuilder let content: Content
  var body: some View {
    VStack(spacing: 4) {
      HStack(spacing: 4) {
        Text("Plaisir ↑").font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted)
          .fixedSize().rotationEffect(.degrees(-90)).frame(width: 14)
        content
          .aspectRatio(1, contentMode: .fit)
          .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
          .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Palette.line))
      }
      Text("Énergie →").font(.caption2.weight(.semibold)).foregroundStyle(Palette.muted)
    }
  }
}

struct Mark: Identifiable {
  let id = UUID()
  var p: Axes
  var label: String? = nil
  var color: Color = Palette.primary
  var strong = false   // mis en avant, hors du tracé (pronostic, comparaison)
  var up = false       // étiquette au-dessus du point
}

// Matrice en lecture : points, tracé reliant les points ordinaires (trajectoire), dernier mis en avant.
struct MatrixPlot: View {
  let marks: [Mark]
  var trail = false
  var corners: [Zone: String]? = nil

  var body: some View {
    let path = marks.filter { !$0.strong }
    Frame {
      ZStack {
        Quadrants(corners: corners)
        GeometryReader { g in
          if trail && path.count > 1 {
            Path { $0.addLines(path.map { spot($0.p, g.size) }) }
              .stroke(Palette.ink.opacity(0.5), style: StrokeStyle(lineWidth: 2, lineJoin: .round, dash: [5, 4]))
          }
          ForEach(Array(marks.enumerated()), id: \.element.id) { i, m in
            let k = path.firstIndex { $0.id == m.id }
            let big = m.strong || !trail || k == path.count - 1
            let fade = big || k == nil ? 1 : 0.35 + 0.65 * Double(k!) / Double(max(1, path.count - 1))
            dot(m, big: big).opacity(fade).position(spot(m.p, g.size))
          }
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(marks.compactMap { m in m.label.map { "\($0) : \(Zone.of(m.p).label)" } }.joined(separator: ", "))
  }

  private func dot(_ m: Mark, big: Bool) -> some View {
    Circle().fill(m.color)
      .frame(width: big ? 22 : 12, height: big ? 22 : 12)
      .overlay(Circle().stroke(.white, lineWidth: big ? 4 : 2))
      .shadow(color: Palette.ink.opacity(0.3), radius: big ? 4 : 1)
      .overlay {
        if let label = m.label {
          Text(label).font(.system(size: 10, weight: .bold)).fixedSize()
            .padding(.horizontal, 6).padding(.vertical, 1)
            .background(.white.opacity(0.9), in: Capsule())
            .offset(y: m.up ? -22 : 22)
        }
      }
  }
}

// Saisie : on touche ou glisse sur la matrice (case de 1 à 5) ; l'impact du point est conservé.
struct MatrixInput: View {
  @Binding var point: Axes?
  var team = false

  var body: some View {
    VStack(spacing: 12) {
      Frame {
        ZStack {
          Quadrants()
          GeometryReader { g in
            if let point {
              Circle().fill(Zone.of(point).color)
                .frame(width: 30, height: 30)
                .overlay(Circle().stroke(.white, lineWidth: 4))
                .shadow(color: Palette.ink.opacity(0.35), radius: 6, y: 3)
                .position(spot(point, g.size))
                .animation(.spring(duration: 0.2), value: point)
            } else {
              Text(team ? "Place ton équipe ici" : "Place ton point ici")
                .font(.subheadline.weight(.semibold)).foregroundStyle(Palette.muted)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(.white.opacity(0.9), in: Capsule())
                .position(x: g.size.width / 2, y: g.size.height / 2)
            }
            Color.clear.contentShape(Rectangle())
              .gesture(DragGesture(minimumDistance: 0).onChanged { v in
                let cell = { (t: Double) in Double(max(1, min(5, Int(t * 5) + 1))) }
                point = Axes(pleasure: 6 - cell(v.location.y / g.size.height), energy: cell(v.location.x / g.size.width), impact: point?.impact ?? 0)
              })
          }
        }
      }
      .sensoryFeedback(.selection, trigger: point)
      .accessibilityElement()
      .accessibilityLabel("Matrice du moral")
      .accessibilityValue(point.map(describe) ?? "Aucun point")
      .accessibilityAdjustableAction { dir in
        var p = point ?? Axes(pleasure: 3, energy: 3, impact: 0)
        p.pleasure = max(1, min(5, p.pleasure + (dir == .increment ? 1 : -1)))
        point = p
      }

      VStack(alignment: .leading, spacing: 2) {
        if let point {
          let z = Zone.of(point)
          Text(z.label).font(.display(19))
          if !team { Text(z.text).font(.subheadline).foregroundStyle(Palette.muted) }
          Text(describe(point)).font(.caption).foregroundStyle(Palette.muted)
        } else {
          Text(team ? "En haut, l'équipe prend du plaisir au travail ; à droite, elle a de l'énergie."
                    : "En haut, tu as pris du plaisir au travail ; à droite, tu avais de l'énergie.")
            .font(.subheadline).foregroundStyle(Palette.muted)
        }
      }
      .frame(maxWidth: .infinity, minHeight: 64, alignment: .leading)
      .padding(14)
      .overlay(RoundedRectangle(cornerRadius: 16).stroke(point.map { Zone.of($0).color } ?? Palette.line, lineWidth: 2))
    }
  }
}

// Le 3e axe : sentiment d'avoir été utile, de 1 à 5.
struct Usefulness: View {
  let rows: [(label: String, value: Double, color: Color)]
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Sentiment d'avoir été utile").font(.subheadline.weight(.semibold))
      ForEach(rows, id: \.label) { r in BarRow(label: r.label, value: r.value, color: r.color, text: "\(fmt(r.value)) / 5") }
    }
    .padding(14)
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line))
  }
}

// Coins en pourcentages pour une répartition par zone.
func zoneShares(_ counts: [String: Int]?, total: Int) -> [Zone: String]? {
  guard let counts, total > 0 else { return nil }
  return Dictionary(uniqueKeysWithValues: [Zone.enthusiasm, .serenity, .tension, .dejection].map {
    ($0, "\(Int((Double(counts[$0.rawValue] ?? 0) / Double(total) * 100).rounded())) %")
  })
}
