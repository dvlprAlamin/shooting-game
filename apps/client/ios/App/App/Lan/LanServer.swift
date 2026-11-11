import Foundation
import Network

/**
 * The WebSocket server of a nearby game this device hosts, like LanServer.java in the Android app. The room itself
 * runs in the page (a Web Worker, see src/net/lan in the web app): this only relays. Paths:
 *
 *   /host?token=...  the room's channel. Only from this device, with the token LanPlugin handed the page, and
 *                    one at a time. Frames: packages/game/src/relay.js.
 *   /rooms/...       players, this device's own included. Each is relayed over the room's channel.
 *   /info            answers one text frame (the game's info and how many players are connected), then closes.
 *
 * Everything runs on `queue`.
 */
final class LanServer: WebSocketPeerDelegate {

    // Connections, not the room's player limit (the room has that): enough for its biggest option and then some.
    private static let maxPlayers = 32
    private static let hostPath = "/host?token="
    static let goneMessage = "The host left, so the game is over."
    private static let fullMessage = "That game is full."
    private static let roomClosed: UInt16 = 4004 // CLOSE.ROOM_CLOSED in packages/game/src/RoomHost.js
    private static let joinFailed: UInt16 = 4000 // CLOSE.JOIN_FAILED
    // Players who go quiet this long are dropped (they get a ping every `checkEvery`).
    private static let checkEvery = 5.0
    private static let quietLimit = 15.0
    private static let handshakeLimit = 10.0

    let port: UInt16
    private let queue: DispatchQueue
    private let listener: NWListener
    private let token: String
    private let info: String // a JSON object
    private var nextId = 1
    private var peers: [ObjectIdentifier: WebSocketPeer] = [:]
    private var players: [String: WebSocketPeer] = [:]
    private var room: WebSocketPeer?
    private var timer: DispatchSourceTimer?

    private init(port: UInt16, token: String, info: String, queue: DispatchQueue) throws {
        let tcp = NWProtocolTCP.Options()
        tcp.noDelay = true
        listener = try NWListener(using: NWParameters(tls: nil, tcp: tcp), on: NWEndpoint.Port(rawValue: port)!)
        self.port = port
        self.token = token
        self.info = info
        self.queue = queue
    }

    /**
     * Starts listening on every interface, on `port` or else one of the next few: calls back on `queue` with the
     * server, or nil if none was free.
     */
    static func start(port: UInt16, tries: Int, token: String, info: String, queue: DispatchQueue,
                      done: @escaping (LanServer?) -> Void) {
        guard tries > 0, let server = try? LanServer(port: port, token: token, info: info, queue: queue) else {
            return done(nil)
        }
        server.listen { ok in
            if ok {
                done(server)
            } else {
                start(port: port + 1, tries: tries - 1, token: token, info: info, queue: queue, done: done)
            }
        }
    }

    private func listen(_ done: @escaping (Bool) -> Void) {
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        listener.stateUpdateHandler = { [weak self] state in
            guard let self else { return }
            switch state {
            case .ready:
                self.listener.stateUpdateHandler = nil
                self.startChecking()
                done(true)
            case .failed:
                // The port is taken.
                self.listener.stateUpdateHandler = nil
                self.listener.cancel()
                done(false)
            default:
                break
            }
        }
        listener.start(queue: queue)
    }

    /** Closes every connection (players get 1001, going away) and stops listening. */
    func stop() {
        timer?.cancel()
        timer = nil
        listener.cancel()
        for peer in peers.values { peer.close(1001) }
        // Whoever doesn't answer the close in time is hung up on.
        queue.asyncAfter(deadline: .now() + 1) { [self] in
            for peer in peers.values { peer.drop() }
        }
    }

    /**
     * Ends the match for everyone, as if the room had gone: players are told why (this device's own player gets
     * `ownMessage`) and closed, and so is the room's channel.
     */
    func end(ownMessage: String) {
        for player in players.values {
            player.send(Self.notification(player.isLoopback ? ownMessage : Self.goneMessage))
            player.close(Self.roomClosed)
        }
        room?.close(1001)
    }

    // ---- Connections

    private func accept(_ connection: NWConnection) {
        let peer = WebSocketPeer(connection, queue: queue)
        peer.delegate = self
        peers[ObjectIdentifier(peer)] = peer
        peer.start()
    }

    func peerOpened(_ peer: WebSocketPeer) {
        let path = peer.path ?? ""
        if path.hasPrefix(Self.hostPath) {
            guard peer.isLoopback, path.dropFirst(Self.hostPath.count) == token, room == nil else {
                return peer.close(1008, "Not allowed")
            }
            peer.role = .room
            room = peer
        } else if path == "/info" {
            // The players count goes in front of the info's own fields.
            let fields = info.count > 2 ? "," + info.dropFirst() : "}"
            peer.send("{\"players\":\(players.count)\(fields)")
            peer.close(1000)
        } else if path.hasPrefix("/rooms/") {
            guard let room, players.count < Self.maxPlayers else {
                peer.send(Self.notification(room == nil ? Self.goneMessage : Self.fullMessage))
                return peer.close(room == nil ? Self.roomClosed : Self.joinFailed)
            }
            let id = String(nextId)
            nextId += 1
            peer.role = .player(id)
            players[id] = peer
            room.send("o" + id)
        } else {
            peer.close(1008, "Not found")
        }
    }

    func peer(_ peer: WebSocketPeer, received text: String) {
        switch peer.role {
        case .room: fromRoom(text)
        case .player(let id): room?.send("m\(id):\(text)")
        case .none: break
        }
    }

    // `s<id>:<text>` sends a player a message, `x<id>:<code>:<reason>` closes their connection.
    private func fromRoom(_ frame: String) {
        guard frame.utf8.count >= 2, let colon = frame.firstIndex(of: ":") else { return }
        guard let player = players[String(frame[frame.index(after: frame.startIndex)..<colon])] else { return }
        let rest = frame[frame.index(after: colon)...]
        switch frame.first {
        case "s":
            player.send(String(rest))
        case "x":
            let parts = rest.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            if let code = UInt16(parts[0]), (1000...4999).contains(code) {
                player.close(code, parts.count > 1 ? String(parts[1]) : "")
            } else {
                player.close(1011)
            }
        default:
            break
        }
    }

    func peerClosed(_ peer: WebSocketPeer) {
        peers[ObjectIdentifier(peer)] = nil
        switch peer.role {
        case .room:
            if room === peer { room = nil }
            // The room has gone without closing its players (the page was closed, or crashed): say why.
            for player in players.values {
                player.send(Self.notification(Self.goneMessage))
                player.close(Self.roomClosed)
            }
        case .player(let id):
            if players.removeValue(forKey: id) != nil { room?.send("c" + id) }
        case .none:
            break
        }
    }

    // Pings players and drops the ones that stopped answering, and connections that never finished the handshake.
    // This device's own connections are left alone: they don't get lost, and while iOS suspends the app they're
    // paused, which LanPlugin deals with.
    private func startChecking() {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + Self.checkEvery, repeating: Self.checkEvery)
        timer.setEventHandler { [weak self] in self?.check() }
        timer.resume()
        self.timer = timer
    }

    private func check() {
        let now = DispatchTime.now().uptimeNanoseconds
        let seconds = { (since: DispatchTime) in Double(now - min(now, since.uptimeNanoseconds)) / 1e9 }
        for peer in peers.values {
            if peer.path == nil {
                if seconds(peer.connected) > Self.handshakeLimit { peer.drop() }
            } else if !peer.isLoopback {
                if seconds(peer.lastHeard) > Self.quietLimit { peer.drop() } else { peer.ping() }
            }
        }
    }

    // The messages are this app's own, with nothing in them to escape.
    private static func notification(_ message: String) -> String {
        "{\"e\":\"notification\",\"d\":{\"message\":\"\(message)\"}}"
    }
}
