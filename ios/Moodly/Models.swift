import Foundation

// Réponses de l'API (clés snake_case converties en camelCase par le décodeur).

enum Role: String, Codable { case employee, manager, admin }

struct TeamRef: Decodable { let id: String; let name: String }
struct Me: Decodable { let id: String; let role: Role; let team: TeamRef? }
struct Tag: Decodable, Identifiable, Hashable { let id: Int; let label: String }
struct WeekStatus: Decodable { let submitted: Bool; let open: Bool; let opensOn: String }
struct Tokens: Decodable { let accessToken: String; let refreshToken: String }

// Un point sur les 3 axes, de 1 à 5.
struct Axes: Codable, Hashable { var pleasure: Double; var energy: Double; var impact: Double }

struct Week: Decodable, Identifiable {
  var id: String { weekStart }
  let weekStart: String
  let prediction: Double?
  let forecast: Axes?
  let factors: [String: Double]?
  let teamAvg, impact, pleasure, energy: Double?
  let responses: Int?
  let gap: Double?
  let dominantTag: String?
  var point: Axes? {
    guard let pleasure, let energy, let impact else { return nil }
    return Axes(pleasure: pleasure, energy: energy, impact: impact)
  }
}

struct TrendCount: Decodable { let better, same, worse: Int }

struct LastWeek: Decodable {
  let weekStart: String
  let responses: Int
  let teamAvg, impact, pleasure, energy: Double
  let energyZones: [String: Int]?
  let tags: [String]
  let factors: [String: Double]?
  let trend: TrendCount?
  var point: Axes { Axes(pleasure: pleasure, energy: energy, impact: impact) }
}

struct CurrentWeek: Decodable { let weekStart: String; let responses: Int }

struct Mirror: Decodable {
  let needsPrediction: Bool
  let teamSize: Int?
  let current: CurrentWeek?
  let last: LastWeek?
  let weeks: [Week]?
}

struct Wishes: Decodable { let weekStart: String; let votes: Int; let wishes: [String: Int] }

struct Benchmark: Decodable {
  let weekStart: String
  let teams, responses: Int
  let participation: Double?
  let teamAvg, pleasure, energy, impact: Double
  let factors: [String: Double]?
  var point: Axes { Axes(pleasure: pleasure, energy: energy, impact: impact) }
}

struct AdminStats: Decodable { let weekStart: String; let avg: Double?; let participation: Double?; let energyZones: [String: Int]? }
struct TrendPoint: Decodable, Hashable { let weekStart: String; let avg: Double }
struct AdminTeam: Decodable, Identifiable {
  let id, name, managerId: String
  let size: Int
  let participation, avg, impact, pleasure, energy: Double?
  let trend: [TrendPoint]?
  // À surveiller : moral bas, plaisir bas ou peu de réponses (mêmes règles que le web).
  var watch: Bool { (avg ?? 5) < 2.6 || (pleasure ?? 5) < 2.5 || (participation ?? 1) < 0.5 }
}
struct AdminUser: Decodable, Identifiable { let id, email: String; let role: Role; let teamId: String?; let createdAt: String; let lastSignInAt: String? }
struct AdminTag: Decodable, Identifiable { let id: Int; let label: String; let uses: Int }
struct AdminData: Decodable { let stats: AdminStats; let teams: [AdminTeam]; let users: [AdminUser]; let tags: [AdminTag] }
