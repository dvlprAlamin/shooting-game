import CryptoKit
import Foundation
import Network

protocol WebSocketPeerDelegate: AnyObject {
    /// The handshake is done: `peer.path` says what it asked for.
    func peerOpened(_ peer: WebSocketPeer)
    func peer(_ peer: WebSocketPeer, received text: String)
    /// The connection is gone, closed or lost. Called once, also for a peer that never opened.
    func peerClosed(_ peer: WebSocketPeer)
}

/**
 * One connection to LanServer: the HTTP upgrade, then WebSocket frames (RFC 6455, text only, no extensions).
 * Network.framework has a WebSocket server of its own, but it doesn't say which path a client asked for, and
 * LanServer needs that. Everything runs on the server's queue.
 */
final class WebSocketPeer {

    enum Role {
        case none
        case room // the room's channel
        case player(String) // a player, with the relay's id for them
    }

    private static let maxFrame = 64 * 1024
    private static let maxMessage = 256 * 1024
    private static let maxHandshake = 8 * 1024
    private static let acceptGUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
    private static let closeTimeout = 2.0 // seconds to wait for the answer to our close frame

    weak var delegate: WebSocketPeerDelegate?
    var role = Role.none
    /// What the handshake asked for, e.g. "/rooms/lan"; nil until it's done.
    private(set) var path: String?
    let connected = DispatchTime.now()
    /// When anything last came in: a pong is enough.
    private(set) var lastHeard = DispatchTime.now()

    private let connection: NWConnection
    private let queue: DispatchQueue
    private var buffer: [UInt8] = []
    private var message: [UInt8]? // a fragmented message so far
    private var messageIsText = true
    private var closing = false // our close frame went out, or theirs came in
    private var finished = false

    init(_ connection: NWConnection, queue: DispatchQueue) {
        self.connection = connection
        self.queue = queue
    }

    /// Whether it comes from this device: its own player, and the room's channel.
    var isLoopback: Bool {
        guard case let .hostPort(host, _) = connection.endpoint else { return false }
        switch host {
        case .ipv4(let a): return a.isLoopback
        case .ipv6(let a): return a.isLoopback || a.asIPv4?.isLoopback == true
        default: return false
        }
    }

    func start() {
        connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .failed, .cancelled: self?.finish()
            default: break
            }
        }
        connection.start(queue: queue)
        receive()
    }

    func send(_ text: String) {
        guard path != nil, !closing, !finished else { return }
        write(Self.frame(0x1, Data(text.utf8)))
    }

    func ping() {
        guard path != nil, !closing, !finished else { return }
        write(Self.frame(0x9, Data()))
    }

    /// Closes with a close frame, so the other side gets `code`. Before the handshake, just hangs up.
    func close(_ code: UInt16 = 1000, _ reason: String = "") {
        guard !closing, !finished else { return }
        guard path != nil else { return finish() }
        closing = true
        var payload = Data([UInt8(code >> 8), UInt8(code & 0xff)])
        payload.append(contentsOf: reason.utf8.prefix(123))
        write(Self.frame(0x8, payload))
        // The other side answers with its own close frame. Don't wait for ever.
        queue.asyncAfter(deadline: .now() + Self.closeTimeout) { [weak self] in self?.finish() }
    }

    /// Hangs up without a close frame: the connection counts as lost (1006 on the other side).
    func drop() {
        finish()
    }

    // ---- Reading

    private func receive() {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) { [weak self] data, _, isComplete, error in
            guard let self, !self.finished else { return }
            if let data, !data.isEmpty {
                self.lastHeard = .now()
                self.buffer.append(contentsOf: data)
                self.process()
            }
            if isComplete || error != nil {
                self.finish()
            } else if !self.finished {
                self.receive()
            }
        }
    }

    private func process() {
        if path == nil {
            guard let end = headerEnd() else {
                if buffer.count > Self.maxHandshake { refuse() }
                return
            }
            let head = String(decoding: buffer[..<end], as: UTF8.self)
            buffer.removeFirst(end + 4)
            handshake(head)
        }
        while path != nil, !finished, let (opcode, fin, payload) = nextFrame() {
            handle(opcode, fin: fin, payload)
        }
    }

    // Where the request's headers end ("\r\n\r\n").
    private func headerEnd() -> Int? {
        guard buffer.count >= 4 else { return nil }
        for i in 0...(buffer.count - 4)
        where buffer[i] == 13 && buffer[i + 1] == 10 && buffer[i + 2] == 13 && buffer[i + 3] == 10 {
            return i
        }
        return nil
    }

    private func handshake(_ head: String) {
        let lines = head.components(separatedBy: "\r\n")
        let request = lines[0].split(separator: " ")
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            headers[name] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
        }
        guard request.count == 3, request[0] == "GET",
              headers["upgrade"]?.lowercased() == "websocket",
              headers["sec-websocket-version"] == "13",
              let key = headers["sec-websocket-key"], !key.isEmpty
        else { return refuse() }
        let accept = Data(Insecure.SHA1.hash(data: Data((key + Self.acceptGUID).utf8))).base64EncodedString()
        write(Data("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: \(accept)\r\n\r\n".utf8))
        path = String(request[1])
        delegate?.peerOpened(self)
    }

    // Not a WebSocket request.
    private func refuse() {
        closing = true
        buffer.removeAll()
        write(Data("HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".utf8)) { [weak self] in
            self?.finish()
        }
    }

    // The next whole frame in the buffer, unmasked: nil until one has arrived (or if it's broken, which closes).
    private func nextFrame() -> (UInt8, Bool, [UInt8])? {
        guard buffer.count >= 2 else { return nil }
        let fin = buffer[0] & 0x80 != 0
        let opcode = buffer[0] & 0x0f
        // No extensions were agreed, so no reserved bits; and every frame from a client is masked.
        guard buffer[0] & 0x70 == 0, buffer[1] & 0x80 != 0 else { fail(1002); return nil }
        var length = Int(buffer[1] & 0x7f)
        var at = 2
        if length == 126 {
            guard buffer.count >= 4 else { return nil }
            length = Int(buffer[2]) << 8 | Int(buffer[3])
            at = 4
        } else if length == 127 {
            guard buffer.count >= 10 else { return nil }
            var n: UInt64 = 0
            for i in 2..<10 { n = n << 8 | UInt64(buffer[i]) }
            guard n <= UInt64(Self.maxFrame) else { fail(1009); return nil }
            length = Int(n)
            at = 10
        }
        guard length <= Self.maxFrame else { fail(1009); return nil }
        // Control frames (close, ping, pong) come whole and small.
        guard opcode < 8 || (fin && length <= 125) else { fail(1002); return nil }
        guard buffer.count >= at + 4 + length else { return nil }
        var payload = Array(buffer[(at + 4)..<(at + 4 + length)])
        for i in 0..<length { payload[i] ^= buffer[at + (i & 3)] }
        buffer.removeFirst(at + 4 + length)
        return (opcode, fin, payload)
    }

    private func handle(_ opcode: UInt8, fin: Bool, _ payload: [UInt8]) {
        switch opcode {
        case 0x8: // close
            if closing { return finish() } // the answer to ours
            closing = true
            // Answer with the same code, then hang up.
            write(Self.frame(0x8, Data(payload.prefix(2)))) { [weak self] in self?.finish() }
        case 0x9: // ping
            if !closing { write(Self.frame(0xa, Data(payload))) }
        case 0xa: // pong
            break
        case 0x1, 0x2: // text, binary
            guard message == nil else { return fail(1002) }
            if fin {
                deliver(isText: opcode == 0x1, payload)
            } else {
                message = payload
                messageIsText = opcode == 0x1
            }
        case 0x0: // the rest of a fragmented message
            guard var m = message else { return fail(1002) }
            m.append(contentsOf: payload)
            guard m.count <= Self.maxMessage else { return fail(1009) }
            if fin {
                message = nil
                deliver(isText: messageIsText, m)
            } else {
                message = m
            }
        default:
            fail(1002)
        }
    }

    private func deliver(isText: Bool, _ bytes: [UInt8]) {
        guard isText, !closing else { return } // nothing in the game sends binary frames
        guard let text = String(bytes: bytes, encoding: .utf8) else { return fail(1007) }
        delegate?.peer(self, received: text)
    }

    // A broken frame: close with `code` and ignore the rest.
    private func fail(_ code: UInt16) {
        buffer.removeAll()
        close(code)
    }

    // ---- Writing

    private func write(_ data: Data, then: (() -> Void)? = nil) {
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            if error != nil { self?.finish() } else { then?() }
        })
    }

    // A frame from the server: never masked.
    private static func frame(_ opcode: UInt8, _ payload: Data) -> Data {
        var out = Data([0x80 | opcode])
        let n = payload.count
        if n < 126 {
            out.append(UInt8(n))
        } else if n <= 0xffff {
            out.append(contentsOf: [126, UInt8(n >> 8), UInt8(n & 0xff)])
        } else {
            out.append(127)
            for shift in stride(from: 56, through: 0, by: -8) { out.append(UInt8((n >> shift) & 0xff)) }
        }
        out.append(payload)
        return out
    }

    private func finish() {
        guard !finished else { return }
        finished = true
        closing = true
        connection.cancel()
        delegate?.peerClosed(self)
    }
}
