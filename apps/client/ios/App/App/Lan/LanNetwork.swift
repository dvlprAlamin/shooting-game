import Darwin
import Foundation
import Network
import dnssd

/** What LanPlugin needs to know about the networks this device is on. */
enum LanNetwork {

    /**
     * This device's IPv4 addresses that nearby players can reach it on: Wi-Fi first, then the hotspot it shares
     * (bridge) and wired ones. Not cellular, VPNs or AirDrop's.
     */
    static func localAddresses() -> [String] {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return [] }
        defer { freeifaddrs(list) }
        var wifi: [String] = []
        var others: [String] = []
        for entry in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let ifa = entry.pointee
            let flags = Int32(ifa.ifa_flags)
            guard let address = ifa.ifa_addr, address.pointee.sa_family == UInt8(AF_INET),
                  flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0
            else { continue }
            let name = String(cString: ifa.ifa_name)
            guard name.hasPrefix("en") || name.hasPrefix("bridge") else { continue }
            let ip = address.withMemoryRebound(to: sockaddr_in.self, capacity: 1) { ipv4String($0.pointee.sin_addr) }
            if ip.hasPrefix("169.254.") { continue } // link-local: no DHCP
            if name == "en0" { wifi.append(ip) } else { others.append(ip) }
        }
        return wifi + others
    }

    /**
     * The routers of the Wi-Fi (and wired) networks this device is on, from the routing table's default routes.
     * On a hotspot, that's the phone sharing it.
     */
    static func gateways() -> [String] {
        // net/route.h isn't in the iOS SDK, so the few numbers needed from it are here.
        let NET_RT_FLAGS: Int32 = 2
        let RTF_GATEWAY: Int32 = 0x2
        let RTA_DST: Int32 = 0x1
        let RTA_GATEWAY: Int32 = 0x2
        let headerSize = 92 // sizeof(struct rt_msghdr)
        var mib: [Int32] = [CTL_NET, PF_ROUTE, 0, AF_INET, NET_RT_FLAGS, RTF_GATEWAY]
        var size = 0
        guard sysctl(&mib, UInt32(mib.count), nil, &size, nil, 0) == 0, size > 0 else { return [] }
        var table = [UInt8](repeating: 0, count: size)
        guard sysctl(&mib, UInt32(mib.count), &table, &size, nil, 0) == 0 else { return [] }

        // Each sockaddr after a message's header takes its length rounded up to 4 bytes (4 if it's empty).
        let padded = { (length: Int) in length > 0 ? 1 + ((length - 1) | 3) : 4 }
        var found: [String] = []
        table.withUnsafeBytes { raw in
            var at = 0
            while at + headerSize <= size {
                let length = Int(raw.loadUnaligned(fromByteOffset: at, as: UInt16.self)) // rtm_msglen
                guard length > 0 else { break }
                defer { at += length }
                let index = raw.loadUnaligned(fromByteOffset: at + 4, as: UInt16.self) // rtm_index
                let addrs = raw.loadUnaligned(fromByteOffset: at + 12, as: Int32.self) // rtm_addrs
                guard addrs & RTA_DST != 0, addrs & RTA_GATEWAY != 0, at + length <= size else { continue }
                // The destination, then the gateway, each a sockaddr_in: sin_len, sin_family, sin_port, sin_addr.
                let dst = at + headerSize
                let dstLength = Int(raw[dst])
                let isDefault = dstLength == 0 || (raw[dst + 1] == UInt8(AF_INET) && (4..<8).allSatisfy { raw[dst + $0] == 0 })
                let gateway = dst + padded(dstLength)
                guard isDefault, gateway + 8 <= at + length, raw[gateway + 1] == UInt8(AF_INET) else { continue }
                var name = [CChar](repeating: 0, count: Int(IF_NAMESIZE) + 1)
                guard if_indextoname(UInt32(index), &name) != nil, String(cString: name).hasPrefix("en") else { continue }
                let ip = (4..<8).map { String(raw[gateway + $0]) }.joined(separator: ".")
                if !found.contains(ip) { found.append(ip) }
            }
        }
        return found
    }

    static func ipv4String(_ address: in_addr) -> String {
        var bytes = address
        return withUnsafeBytes(of: &bytes) { $0.map(String.init).joined(separator: ".") }
    }
}

/** Advertises a game on the network with Bonjour (DNS-SD), so players nearby see it. */
final class LanAdvertiser {

    private var ref: DNSServiceRef?

    /** Starts advertising `port` as `name`. Nil if it couldn't: players can still join by address. */
    init?(name: String, type: String, port: UInt16, queue: DispatchQueue) {
        var ref: DNSServiceRef?
        let error = DNSServiceRegister(&ref, 0, 0, name, type, nil, nil, port.bigEndian, 0, nil, { _, _, error, _, _, _, _ in
            // Local Network access turned off, for one.
            if error != kDNSServiceErr_NoError { NSLog("Lan: couldn't advertise the game (%d)", error) }
        }, nil)
        guard error == kDNSServiceErr_NoError, let ref else {
            NSLog("Lan: couldn't advertise the game (%d)", error)
            return nil
        }
        DNSServiceSetDispatchQueue(ref, queue)
        self.ref = ref
    }

    /** Call on the queue it was made with. */
    func stop() {
        if let ref { DNSServiceRefDeallocate(ref) }
        ref = nil
    }
}

/**
 * Looks for games advertised nearby. `onFound` gets each one's name, IPv4 address and port, `onLost` the name of
 * one that went, and `onBlocked` whether iOS keeps the app off the local network (Local Network access turned off
 * in Settings). They're called on `queue`.
 */
final class LanBrowser {

    var onFound: ((String, String, Int) -> Void)?
    var onLost: ((String) -> Void)?
    var onBlocked: ((Bool) -> Void)?

    private static let resolveTimeout = 5.0

    private let browser: NWBrowser
    private let queue: DispatchQueue
    private var resolving: [String: NWConnection] = [:] // by service name

    init(type: String, queue: DispatchQueue) {
        browser = NWBrowser(for: .bonjour(type: type, domain: nil), using: NWParameters())
        self.queue = queue
    }

    func start() {
        browser.browseResultsChangedHandler = { [weak self] _, changes in
            for change in changes {
                switch change {
                case .added(let result):
                    self?.resolve(result.endpoint)
                case .removed(let result):
                    if case let .service(name, _, _, _) = result.endpoint { self?.onLost?(name) }
                default:
                    break
                }
            }
        }
        browser.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
                self?.onBlocked?(false)
            case .waiting(let error), .failed(let error):
                if case let .dns(code) = error, code == DNSServiceErrorType(kDNSServiceErr_PolicyDenied) {
                    self?.onBlocked?(true)
                }
            default:
                break
            }
        }
        browser.start(queue: queue)
    }

    func stop() {
        browser.cancel()
        for connection in resolving.values { connection.cancel() }
        resolving.removeAll()
    }

    // Bonjour gives a game's name; the page needs an address. With Network.framework, connecting is how to resolve
    // one: the connection says where it went. IPv4, like the addresses players type.
    private func resolve(_ endpoint: NWEndpoint) {
        guard case let .service(name, _, _, _) = endpoint else { return }
        let parameters = NWParameters.tcp
        (parameters.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options)?.version = .v4
        let connection = NWConnection(to: endpoint, using: parameters)
        resolving[name]?.cancel()
        resolving[name] = connection
        connection.stateUpdateHandler = { [weak self, weak connection] state in
            guard let self, let connection else { return }
            switch state {
            case .ready:
                if case let .hostPort(host, port) = connection.currentPath?.remoteEndpoint, case let .ipv4(ip) = host {
                    self.onFound?(name, ip.rawValue.map(String.init).joined(separator: "."), Int(port.rawValue))
                }
                connection.cancel()
            case .waiting, .failed:
                connection.cancel()
            case .cancelled:
                if self.resolving[name] === connection { self.resolving[name] = nil }
            default:
                break
            }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + Self.resolveTimeout) { [weak connection] in connection?.cancel() }
    }
}
