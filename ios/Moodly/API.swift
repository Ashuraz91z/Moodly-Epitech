import Foundation
import Observation
import Security

struct APIError: LocalizedError {
  let message: String
  let status: Int
  var errorDescription: String? { message }
}

// Tokens dans le Keychain, jamais en clair dans les préférences.
enum Keychain {
  static func get(_ key: String) -> String? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key,
      kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  static func set(_ value: String?, _ key: String) {
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
    SecItemDelete(query as CFDictionary)
    guard let value else { return }
    var add = query
    add[kSecValueData as String] = Data(value.utf8)
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(add as CFDictionary, nil)
  }
}

// Client de l'API Moodly : Bearer token, renouvellement automatique sur 401, session et démo.
@MainActor @Observable final class API {
  var server: String { didSet { UserDefaults.standard.set(server, forKey: "server") } }
  var demo: Bool { didSet { UserDefaults.standard.set(demo, forKey: "demo") } }
  var signedIn: Bool
  var me: Me?

  static let decoder: JSONDecoder = {
    let d = JSONDecoder()
    d.keyDecodingStrategy = .convertFromSnakeCase
    return d
  }()

  init() {
    server = UserDefaults.standard.string(forKey: "server")
      ?? Bundle.main.object(forInfoDictionaryKey: "MoodlyAPI") as? String ?? "http://localhost:3001"
    demo = UserDefaults.standard.bool(forKey: "demo")
    signedIn = Keychain.get("access") != nil
  }

  func get<T: Decodable>(_ path: String) async throws -> T {
    let data = try await call(path, method: "GET", body: nil) ?? Data("null".utf8)
    return try Self.decoder.decode(T.self, from: data)
  }

  // Réponse 204 (rien à renvoyer) → nil.
  func getOptional<T: Decodable>(_ path: String) async throws -> T? {
    guard let data = try await call(path, method: "GET", body: nil) else { return nil }
    return try Self.decoder.decode(T.self, from: data)
  }

  func send(_ path: String, _ body: [String: Any?], method: String = "POST") async throws {
    _ = try await call(path, method: method, body: body)
  }

  func login(email: String, password: String) async throws {
    try store(await call("/api/auth/login", method: "POST", body: ["email": email, "password": password], retry: false))
    demo = false
    try await loadMe()
  }

  // Démo sans identifiants : reset remet toute la démo à zéro, sinon on change seulement de rôle.
  func enterDemo(_ role: Role, reset: Bool) async throws {
    try store(await call("/api/auth/demo", method: "POST", body: ["as": role.rawValue, "reset": reset], retry: false))
    demo = true
    try await loadMe()
    if role == .employee, reset, let me { History.seedDemo(me.id) }
  }

  func loadMe() async throws {
    me = try await get("/api/me")
  }

  func logout() async {
    _ = try? await call("/api/auth/logout", method: "POST", body: [:], retry: false)
    signOutLocally()
  }

  func signOutLocally() {
    Keychain.set(nil, "access")
    Keychain.set(nil, "refresh")
    me = nil
    demo = false
    signedIn = false
  }

  private func store(_ data: Data?) throws {
    guard let data else { throw APIError(message: "Réponse vide", status: 0) }
    let tokens = try Self.decoder.decode(Tokens.self, from: data)
    Keychain.set(tokens.accessToken, "access")
    Keychain.set(tokens.refreshToken, "refresh")
    signedIn = true
  }

  private func refresh() async -> Bool {
    guard let token = Keychain.get("refresh"),
          let data = try? await call("/api/auth/refresh", method: "POST", body: ["refresh_token": token], retry: false),
          (try? store(data)) != nil else { return false }
    return true
  }

  private func call(_ path: String, method: String, body: [String: Any?]?, retry: Bool = true) async throws -> Data? {
    guard let url = URL(string: server + path) else { throw APIError(message: "Adresse du serveur invalide", status: 0) }
    var req = URLRequest(url: url, timeoutInterval: 20)
    req.httpMethod = method
    if let body {
      req.setValue("application/json", forHTTPHeaderField: "Content-Type")
      req.httpBody = try JSONSerialization.data(withJSONObject: body.mapValues { $0 ?? NSNull() })
    }
    if let token = Keychain.get("access") { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }

    let data: Data, res: URLResponse
    do {
      (data, res) = try await URLSession.shared.data(for: req)
    } catch {
      throw APIError(message: "Serveur injoignable (\(server)). Vérifie l'adresse et le réseau.", status: 0)
    }
    let status = (res as? HTTPURLResponse)?.statusCode ?? 0
    if status == 401, retry, await refresh() { return try await call(path, method: method, body: body, retry: false) }
    if status == 401, !path.hasPrefix("/api/auth/") { signOutLocally() }
    guard (200..<300).contains(status) else {
      let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
      throw APIError(message: message ?? "Erreur réseau (\(status))", status: status)
    }
    return status == 204 || data.isEmpty ? nil : data
  }
}
