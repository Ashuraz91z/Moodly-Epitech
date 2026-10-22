import SwiftUI
import UserNotifications

// Mêmes règles que la version web (api/app/matrix.tsx, questionnaire.ts, history.ts).

// MARK: Matrice plaisir × énergie

enum Zone: String, CaseIterable {
  case enthusiasm, serenity, tension, dejection, middle

  var label: String {
    switch self {
    case .enthusiasm: "En forme"
    case .serenity: "Serein·e"
    case .tension: "Sous pression"
    case .dejection: "À bout"
    case .middle: "Mitigé"
    }
  }

  var text: String {
    switch self {
    case .enthusiasm: "Du plaisir et de l'énergie : tu es dans une bonne dynamique."
    case .serenity: "Du plaisir mais peu d'énergie : calme, peut-être en train de récupérer."
    case .tension: "De l'énergie mais peu de plaisir : du stress, à surveiller."
    case .dejection: "Peu d'énergie et peu de plaisir : un signe d'épuisement, parles-en."
    case .middle: "Ni vraiment bien, ni vraiment mal."
    }
  }

  var color: Color {
    switch self {
    case .enthusiasm: Color(hex: 0x6ee7b7)
    case .serenity: Color(hex: 0x93c5fd)
    case .tension: Color(hex: 0xfdba74)
    case .dejection: Color(hex: 0xfca5a5)
    case .middle: Color(hex: 0xe2e8f0)
    }
  }

  static func of(_ p: Axes) -> Zone {
    let e = p.energy, v = p.pleasure
    if e > 3 && v > 3 { return .enthusiasm }
    if e < 3 && v > 3 { return .serenity }
    if e > 3 && v < 3 { return .tension }
    if e < 3 && v < 3 { return .dejection }
    return .middle
  }
}

private let level = ["très faible", "faible", "moyen", "élevé", "très élevé"]
private let levelF = ["très faible", "faible", "moyenne", "élevée", "très élevée"]
func describe(_ p: Axes) -> String {
  let i = { (v: Double) in max(0, min(4, Int(v.rounded()) - 1)) }
  return "Plaisir \(level[i(p.pleasure)]), énergie \(levelF[i(p.energy)])"
}

// MARK: Questionnaire hebdomadaire

enum Q {
  static let statements = [
    "Ma charge de travail était tenable.",
    "J'ai pu déconnecter en dehors de mes heures de travail.",
    "J'ai pu organiser mon travail comme je le souhaitais.",
    "J'ai dû faire face à des situations tendues ou cacher mes émotions.",
    "J'ai pu compter sur mes collègues.",
    "Je me suis senti·e soutenu·e par mon manager.",
    "Mon travail a été reconnu à sa juste valeur.",
    "J'ai trouvé du sens à ce que j'ai fait.",
    "Je me suis senti·e serein·e face à l'avenir de mon poste.",
  ]
  static let short = ["Charge de travail", "Déconnexion", "Organisation", "Situations tendues", "Collègues", "Soutien du manager", "Reconnaissance", "Sens", "Avenir du poste"]
  static let agree = ["Pas du tout d'accord", "Plutôt pas d'accord", "Ni l'un ni l'autre", "Plutôt d'accord", "Tout à fait d'accord"]
  static let trends: [(value: Int, label: String)] = [(-1, "Moins bonne"), (0, "Pareille"), (1, "Meilleure")]
  static let useful = ["Pas du tout", "Un peu", "Moyennement", "Plutôt", "Tout à fait"]
  static let wishes: [(key: String, label: String)] = [
    ("intensite", "Alléger la charge ou mieux prioriser"),
    ("autonomie", "Plus de liberté pour m'organiser"),
    ("emotions", "Être soutenu·e face aux situations tendues"),
    ("relations", "Plus d'échanges et de reconnaissance"),
    ("sens", "Mieux voir à quoi sert mon travail"),
    ("securite", "Plus de visibilité sur l'avenir"),
    ("rien", "Rien de particulier, ça va"),
  ]
  // Ce que l'équipe demande, vu côté manager.
  static let asks: [String: String] = [
    "intensite": "Alléger la charge, mieux prioriser",
    "autonomie": "Plus de liberté pour s'organiser",
    "emotions": "Du soutien face aux situations tendues",
    "relations": "Plus d'échanges et de reconnaissance",
    "sens": "Mieux voir à quoi sert son travail",
    "securite": "Plus de visibilité sur l'avenir",
    "rien": "Rien de particulier, ça va",
  ]
  // Les 6 facteurs de risques psychosociaux (Gollac), mêmes regroupements que get_mirror.
  static let factors: [(key: String, label: String, q: [Int])] = [
    ("intensite", "Charge et temps de travail", [0, 1]),
    ("autonomie", "Autonomie", [2]),
    ("emotions", "Exigences émotionnelles", [3]),
    ("relations", "Relations et reconnaissance", [4, 5, 6]),
    ("sens", "Sens du travail", [7]),
    ("securite", "Sérénité sur l'avenir", [8]),
  ]
  static func factorLabel(_ key: String) -> String { factors.first { $0.key == key }?.label ?? key }

  // 5 = toujours favorable (Q6 inversée).
  private static func note(_ a: [Int], _ i: Int) -> Double { Double(i == 3 ? 6 - a[i] : a[i]) }
  private static func mean(_ a: [Int], _ idx: [Int]) -> Double { idx.map { note(a, $0) }.reduce(0, +) / Double(idx.count) }

  static func factorsOf(_ a: [Int]) -> [(label: String, value: Double)] { factors.map { ($0.label, mean(a, $0.q)) } }

  // Où les réponses situent la personne sur les 3 axes.
  static func fromAnswers(_ a: [Int]) -> Axes {
    Axes(pleasure: mean(a, [3, 4, 5, 8]), energy: mean(a, [0, 1]), impact: mean(a, [2, 6, 7]))
  }

  static func compareText(_ me: Axes, _ calc: Axes) -> String {
    let axes: [(name: String, gap: Double)] = [
      ("de plaisir", me.pleasure - calc.pleasure), ("d'énergie", me.energy - calc.energy), ("d'impact", me.impact - calc.impact),
    ].filter { abs($0.gap) >= 1 }
    if axes.isEmpty { return "Ton ressenti et tes réponses concordent : tu te lis plutôt juste cette semaine." }
    return axes.map {
      $0.gap > 0 ? "Tu t'attribues plus \($0.name) que ce que disent tes réponses." : "Tes réponses montrent plus \($0.name) que tu ne le ressens."
    }.joined(separator: " ")
  }

  // Aide affichée : abattement, plaisir à 1 ou 2, ou Q6 à 5.
  static func needsHelp(_ me: Axes, _ answers: [Int]?) -> Bool {
    (me.energy < 3 && me.pleasure < 3) || me.pleasure <= 2 || answers?[3] == 5
  }
}

// MARK: Dates (semaines du lundi, heure de Paris)

enum Day {
  private static let utc = TimeZone(identifier: "UTC")!
  private static func formatter(_ format: String, _ tz: TimeZone = utc) -> DateFormatter {
    let f = DateFormatter()
    f.locale = Locale(identifier: "fr_FR")
    f.timeZone = tz
    f.dateFormat = format
    return f
  }
  private static let iso = formatter("yyyy-MM-dd")
  private static let paris = formatter("yyyy-MM-dd", TimeZone(identifier: "Europe/Paris")!)
  private static let shortF = formatter("d MMM")
  private static let longF = formatter("d MMMM")
  private static let weekdayF = formatter("EEEE d MMMM")
  private static var cal: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = utc; return c }

  static func today() -> String { paris.string(from: .now) }
  static func date(_ d: String) -> Date { iso.date(from: String(d.prefix(10))) ?? .now }
  static func add(_ d: String, days: Int) -> String { iso.string(from: cal.date(byAdding: .day, value: days, to: date(d))!) }
  static func monday(_ d: String) -> String { add(d, days: -((cal.component(.weekday, from: date(d)) + 5) % 7)) }
  // Les n derniers lundis, du plus ancien à la semaine en cours.
  static func lastWeeks(_ today: String, _ n: Int) -> [String] { (0..<n).map { add(monday(today), days: -7 * (n - 1 - $0)) } }
  static func short(_ d: String) -> String { shortF.string(from: date(d)) }
  static func long(_ d: String) -> String { longF.string(from: date(d)) }
  static func weekday(_ d: String) -> String { weekdayF.string(from: date(d)) }
}

// MARK: Historique personnel (sur l'appareil uniquement, jamais envoyé)

struct Entry: Codable {
  var pleasure: Double, energy: Double, impact: Double
  var answers: [Int]?
  var axes: Axes { Axes(pleasure: pleasure, energy: energy, impact: impact) }
}

enum History {
  private static func key(_ uid: String) -> String { "moodly-historique-\(uid)" }

  static func read(_ uid: String) -> [String: Entry] {
    guard let data = UserDefaults.standard.data(forKey: key(uid)) else { return [:] }
    return (try? JSONDecoder().decode([String: Entry].self, from: data)) ?? [:]
  }

  static func save(_ uid: String, _ h: [String: Entry]) {
    UserDefaults.standard.set(try? JSONEncoder().encode(h), forKey: key(uid))
  }

  // Semaines d'affilée ; la semaine en cours compte si elle est faite, sans casser la série sinon.
  static func streak(_ h: [String: Entry], _ today: String) -> Int {
    let weeks = Array(Day.lastWeeks(today, 104).reversed())
    var n = 0
    for w in weeks {
      if h[w] != nil { n += 1 } else if w != weeks[0] { break }
    }
    return n
  }

  // Démo : 11 semaines plausibles pour Inès (à bout, transition, puis en forme), l'accueil réaffiché.
  static func seedDemo(_ uid: String) {
    func n(_ x: Double) -> Int { max(1, min(5, Int((x + Double.random(in: -0.8...0.8)).rounded()))) }
    let weeks = Day.lastWeeks(Day.today(), 12).dropLast()
    var h: [String: Entry] = [:]
    for (idx, w) in weeks.enumerated() {
      let k = weeks.count - idx
      if k > 2 && Double.random(in: 0..<1) < 0.1 { continue }
      let (p, e, i) = k > 5 ? (1.8, 2.2, 4.2) : k > 3 ? (3.0, 3.0, 4.0) : (4.2, 4.0, 4.3)
      h[w] = Entry(pleasure: Double(n(p)), energy: Double(n(e)), impact: Double(n(i)),
                   answers: [n(e), n(e), n(i), n(6 - p), n(p), n(p), n(i), n(i), n(p)])
    }
    save(uid, h)
    UserDefaults.standard.removeObject(forKey: "onboarding")
  }
}

// MARK: Rappel du jeudi

enum Reminder {
  private static let id = "moodly-jeudi"
  static var on: Bool { UserDefaults.standard.bool(forKey: "reminder") }

  static func set(_ on: Bool) async -> Bool {
    let center = UNUserNotificationCenter.current()
    center.removePendingNotificationRequests(withIdentifiers: [id])
    UserDefaults.standard.set(false, forKey: "reminder")
    guard on, (try? await center.requestAuthorization(options: [.alert, .sound])) == true else { return false }
    let content = UNMutableNotificationContent()
    content.title = "Ta semaine en 2 minutes"
    content.body = "Le questionnaire Moodly est ouvert aujourd'hui et demain. Anonyme, comme toujours."
    // Jeudi (5 dans le calendrier grégorien, dimanche = 1) à 10 h.
    let trigger = UNCalendarNotificationTrigger(dateMatching: DateComponents(hour: 10, weekday: 5), repeats: true)
    try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    UserDefaults.standard.set(true, forKey: "reminder")
    return true
  }
}
