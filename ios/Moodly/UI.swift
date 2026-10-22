import SwiftUI

// Même charte que le web : violet humeur, fonds lavande, titres en serif.

extension Color {
  init(hex: UInt32) {
    self.init(red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255, blue: Double(hex & 0xff) / 255)
  }
}

enum Palette {
  static let primary = Color(hex: 0x7c3aed)
  static let primarySoft = Color(hex: 0xf3eeff)
  static let ink = Color(hex: 0x2e1065)
  static let page = Color(hex: 0xfaf5ff)
  static let soft = Color(hex: 0xf7f3fd)
  static let line = Color(hex: 0xece4fa)
  static let muted = Color(hex: 0x475569)
  static let team = Color(hex: 0xe11d48)
  static let forecast = Color(hex: 0x7c3aed)
  static let company = Color(hex: 0x475569)
  static let green = Color(hex: 0x047857)
  static let greenSoft = Color(hex: 0xd1fae5)
  static let rose = Color(hex: 0xbe123c)
  static let roseSoft = Color(hex: 0xfff1f2)
  static let amber = Color(hex: 0xb45309)
  static let amberSoft = Color(hex: 0xfef3c7)
}

func fmt(_ x: Double) -> String { String(format: "%.1f", x).replacingOccurrences(of: ".", with: ",") }
func pct(_ x: Double?) -> String { x.map { "\(Int(($0 * 100).rounded())) %" } ?? "—" }
func signed(_ x: Double) -> String { (x >= 0.05 ? "+" : x <= -0.05 ? "−" : "") + fmt(abs(x)) }
// Note de 1 à 5 : bon, moyen, bas.
func tone(_ v: Double) -> Color { v >= 3.4 ? Palette.green : v >= 2.6 ? Color(hex: 0xf59e0b) : Color(hex: 0xe11d48) }

extension Font {
  static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .semibold, design: .serif) }
}

struct Card: ViewModifier {
  var fill: Color = .white
  func body(content: Content) -> some View {
    content
      .padding(18)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(fill, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
      .shadow(color: Palette.ink.opacity(0.06), radius: 14, y: 6)
  }
}

extension View {
  func card(_ fill: Color = .white) -> some View { modifier(Card(fill: fill)) }
}

struct Eyebrow: View {
  let text: String
  var body: some View {
    Text(text.uppercased()).font(.caption.weight(.bold)).tracking(2).foregroundStyle(Palette.primary)
  }
}

struct SectionTitle: View {
  let title: String
  var sub: String? = nil
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(title).font(.display(20))
      if let sub { Text(sub).font(.footnote).foregroundStyle(Palette.muted) }
    }
  }
}

struct PrimaryButton: ButtonStyle {
  var dark = false
  @Environment(\.isEnabled) private var enabled
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.headline)
      .frame(maxWidth: .infinity, minHeight: 52)
      .foregroundStyle(.white)
      .background(dark ? Palette.ink : Palette.primary, in: Capsule())
      .opacity(enabled ? 1 : 0.4)
      .scaleEffect(configuration.isPressed ? 0.98 : 1)
  }
}

struct GhostButton: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.subheadline.weight(.semibold))
      .padding(.horizontal, 16)
      .frame(minHeight: 44)
      .foregroundStyle(Palette.primary)
      .background(Palette.primarySoft, in: Capsule())
      .opacity(configuration.isPressed ? 0.7 : 1)
  }
}

// Une réponse (bouton radio) : sélectionne seulement, on avance avec « Suivante ».
struct Choice: View {
  let label: String
  var number: Int? = nil
  let selected: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      HStack(spacing: 12) {
        if let number {
          Text("\(number)").font(.subheadline.bold())
            .frame(width: 30, height: 30)
            .background(selected ? Palette.primary : Palette.soft, in: RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(selected ? .white : Palette.muted)
        }
        Text(label).font(.body.weight(selected ? .semibold : .regular)).multilineTextAlignment(.leading)
        Spacer(minLength: 0)
        if selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(Palette.primary) }
      }
      .padding(.horizontal, 14)
      .frame(minHeight: 54)
      .foregroundStyle(selected ? Palette.primary : .primary)
      .background(selected ? Palette.primarySoft : .white, in: RoundedRectangle(cornerRadius: 14))
      .overlay(RoundedRectangle(cornerRadius: 14).stroke(selected ? Palette.primary : Color(hex: 0xd6cfe6), lineWidth: selected ? 2 : 1))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
    .sensoryFeedback(.selection, trigger: selected)
  }
}

struct Chip: View {
  let label: String
  let selected: Bool
  let action: () -> Void
  var body: some View {
    Button(action: action) {
      Text(label).font(.subheadline)
        .padding(.horizontal, 14).frame(minHeight: 40)
        .foregroundStyle(selected ? .white : .primary)
        .background(selected ? Palette.primary : .white, in: Capsule())
        .overlay(Capsule().stroke(selected ? Palette.primary : Palette.line))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}

struct Pill: View {
  let text: String
  var fg: Color = Palette.muted
  var bg: Color = Palette.soft
  var body: some View {
    Text(text).font(.caption.weight(.semibold)).padding(.horizontal, 10).padding(.vertical, 3)
      .foregroundStyle(fg).background(bg, in: Capsule())
  }
}

// Barre horizontale de 0 à max.
struct Meter: View {
  let value: Double
  var max: Double = 5
  var color: Color = Palette.primary
  var body: some View {
    GeometryReader { g in
      ZStack(alignment: .leading) {
        Capsule().fill(Palette.line)
        Capsule().fill(color).frame(width: g.size.width * Swift.max(0, Swift.min(1, value / max)))
      }
    }
    .frame(height: 8)
  }
}

// Ligne libellé / barre / valeur.
struct BarRow: View {
  let label: String
  let value: Double
  var max: Double = 5
  var color: Color = Palette.primary
  var text: String? = nil
  var body: some View {
    HStack(spacing: 10) {
      Text(label).font(.subheadline).frame(maxWidth: .infinity, alignment: .leading)
      Meter(value: value, max: max, color: color).frame(maxWidth: .infinity)
      Text(text ?? fmt(value)).font(.subheadline.monospacedDigit()).frame(width: 52, alignment: .trailing)
    }
    .accessibilityElement(children: .combine)
  }
}

struct Tile: View {
  let title: String
  let value: String
  var sub: String? = nil
  var fill: Color = Palette.soft
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(title).font(.footnote).foregroundStyle(Palette.muted)
      Text(value).font(.display(26)).lineLimit(2).minimumScaleFactor(0.7)
      if let sub { Text(sub).font(.footnote).foregroundStyle(Palette.muted) }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(fill, in: RoundedRectangle(cornerRadius: 16))
  }
}

struct Note: View {
  let text: String
  var body: some View {
    Text(text).font(.footnote).foregroundStyle(Palette.muted)
      .padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background(Palette.soft, in: RoundedRectangle(cornerRadius: 14))
  }
}

struct Verdict: View {
  let text: Text
  var body: some View {
    text.font(.subheadline)
      .padding(14).frame(maxWidth: .infinity, alignment: .leading)
      .background(Palette.primarySoft, in: RoundedRectangle(cornerRadius: 12))
      .overlay(alignment: .leading) { Rectangle().fill(Palette.primary).frame(width: 4) }
      .clipShape(RoundedRectangle(cornerRadius: 12))
  }
}

struct ErrorText: View {
  let text: String?
  var body: some View {
    if let text { Text(text).font(.footnote).foregroundStyle(Palette.rose) }
  }
}

// Mise en page en lignes qui reviennent à la ligne (puces des sujets).
struct Flow: Layout {
  var spacing: CGFloat = 8
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    rows(proposal.width ?? .infinity, subviews).last.map { CGSize(width: proposal.width ?? $0.maxX, height: $0.maxY) } ?? .zero
  }
  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    for (i, frame) in rows(bounds.width, subviews).enumerated() {
      subviews[i].place(at: CGPoint(x: bounds.minX + frame.minX, y: bounds.minY + frame.minY), proposal: ProposedViewSize(frame.size))
    }
  }
  private func rows(_ width: CGFloat, _ subviews: Subviews) -> [CGRect] {
    var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0
    return subviews.map { view in
      let size = view.sizeThatFits(.unspecified)
      if x > 0 && x + size.width > width { x = 0; y += line + spacing; line = 0 }
      defer { x += size.width + spacing; line = max(line, size.height) }
      return CGRect(origin: CGPoint(x: x, y: y), size: size)
    }
  }
}

// Partage d'un export CSV (séparateur « ; » pour Excel en français).
func csv(_ rows: [[String]]) -> String {
  rows.map { $0.map { "\"\($0.replacingOccurrences(of: "\"", with: "\"\""))\"" }.joined(separator: ";") }.joined(separator: "\n")
}
