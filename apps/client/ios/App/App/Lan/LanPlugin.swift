import Capacitor
import Foundation
import UIKit

/**
 * Nearby games over Wi-Fi or a phone's hotspot, no internet needed (src/net/lan in the web app). The same methods
 * and events as LanPlugin.java in the Android app, but no tunnels: the page here is served from
 * capacitor://localhost, not https, so WebKit lets it open ws:// to other devices itself.
 *
 * Hosting: startHost opens LanServer on every interface and advertises it with Bonjour (_rimfire._tcp); the page
 * runs the room and connects to it as the room's channel. Joining: startDiscovery reports games advertised nearby
 * ("found" / "lost" events, and "blocked" while Local Network access is off), and gateways lists the routers of
 * the Wi-Fi this device is on (on a hotspot, the phone sharing it is the likely host).
 *
 * iOS suspends an app soon after it goes to the background, which would freeze a hosted game for everyone: it
 * keeps going for a little while, then ends with a notice to each player.
 */
@objc(LanPlugin)
public class LanPlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "LanPlugin"
    public let jsName = "Lan"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopHost", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startDiscovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopDiscovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "gateways", returnType: CAPPluginReturnPromise),
    ]

    private static let serviceType = "_rimfire._tcp" // also in Info.plist (NSBonjourServices)
    // The list shows each game's name from /info; Bonjour numbers the others with this name ("RimFire game (2)").
    private static let serviceName = "RimFire game"
    private static let portsToTry = 10
    // How long a hosted game keeps going while the app is in the background (iOS allows about 30 s).
    private static let backgroundGrace = 20.0
    private static let backgroundMessage = "The game ended while RimFire was in the background."

    private let queue = DispatchQueue(label: "com.dvlpralamin.rimfire.lan")
    // On `queue`:
    private var server: LanServer?
    private var advertiser: LanAdvertiser?
    private var browser: LanBrowser?
    private var hostings = 0 // counts startHost calls, so a late start can tell it was superseded
    // On the main thread:
    private var backgroundTask = UIBackgroundTaskIdentifier.invalid
    private var backgroundEnd: DispatchWorkItem?

    override public func load() {
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground),
                           name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(willEnterForeground),
                           name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    // ---- Hosting

    /**
     * Starts hosting: { port, info } -> { port, token, addresses }. `port` is the one to try first (the next few
     * are tried after it), `info` what /info answers besides the player count, `token` what the room's channel
     * must show, and `addresses` this device's addresses others can join it on.
     */
    @objc func startHost(_ call: CAPPluginCall) {
        let first = call.getInt("port") ?? 7350
        let info = call.getObject("info") ?? [:]
        guard (1...65535).contains(first), JSONSerialization.isValidJSONObject(info),
              let json = try? JSONSerialization.data(withJSONObject: info), let infoText = String(data: json, encoding: .utf8)
        else { return call.reject("Needs a port and info") }
        let token = Self.newToken()
        queue.async { [self] in
            stopHosting()
            hostings += 1
            let hosting = hostings
            let tries = min(Self.portsToTry, 65536 - first)
            LanServer.start(port: UInt16(first), tries: tries, token: token, info: infoText, queue: queue) { [self] server in
                guard let server else { return call.reject("No free port to host on") }
                guard hosting == hostings else {
                    server.stop()
                    return call.reject("Stopped")
                }
                self.server = server
                advertiser = LanAdvertiser(name: Self.serviceName, type: Self.serviceType, port: server.port, queue: queue)
                call.resolve(["port": Int(server.port), "token": token, "addresses": LanNetwork.localAddresses()])
            }
        }
    }

    @objc func stopHost(_ call: CAPPluginCall) {
        queue.async { [self] in
            hostings += 1 // a start still under way is dropped
            stopHosting()
            call.resolve()
        }
    }

    // On `queue`.
    private func stopHosting() {
        advertiser?.stop()
        advertiser = nil
        server?.stop()
        server = nil
    }

    private static func newToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        if SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) != errSecSuccess {
            bytes = (0..<16).map { _ in UInt8.random(in: 0...255) }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    // ---- In the background

    @objc private func didEnterBackground() {
        guard backgroundEnd == nil, queue.sync(execute: { server != nil }) else { return }
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "Nearby game") { [weak self] in
            self?.endInBackground(waitForFrames: false)
        }
        let end = DispatchWorkItem { [weak self] in self?.endInBackground(waitForFrames: true) }
        backgroundEnd = end
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.backgroundGrace, execute: end)
    }

    @objc private func willEnterForeground() {
        backgroundEnd?.cancel()
        backgroundEnd = nil
        endBackgroundTask()
    }

    // The app is about to be suspended: end the game, so nobody is left in a frozen one. The page stops hosting
    // when it runs again and its own player is sent back to the menu with the notice.
    private func endInBackground(waitForFrames: Bool) {
        backgroundEnd?.cancel()
        backgroundEnd = nil
        queue.sync { [self] in
            advertiser?.stop()
            advertiser = nil
            server?.end(ownMessage: Self.backgroundMessage)
        }
        if waitForFrames {
            // Time for the notices and close frames to go out.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in self?.endBackgroundTask() }
        } else {
            endBackgroundTask()
        }
    }

    private func endBackgroundTask() {
        guard backgroundTask != .invalid else { return }
        UIApplication.shared.endBackgroundTask(backgroundTask)
        backgroundTask = .invalid
    }

    // ---- Finding games

    /** Looks for games on the network until stopDiscovery: "found" { name, host, port }, "lost" { name }, "blocked" { blocked }. */
    @objc func startDiscovery(_ call: CAPPluginCall) {
        queue.async { [self] in
            browser?.stop()
            let browser = LanBrowser(type: Self.serviceType, queue: queue)
            browser.onFound = { [weak self] name, host, port in
                self?.notifyListeners("found", data: ["name": name, "host": host, "port": port])
            }
            browser.onLost = { [weak self] name in self?.notifyListeners("lost", data: ["name": name]) }
            browser.onBlocked = { [weak self] blocked in self?.notifyListeners("blocked", data: ["blocked": blocked]) }
            browser.start()
            self.browser = browser
            call.resolve()
        }
    }

    @objc func stopDiscovery(_ call: CAPPluginCall) {
        queue.async { [self] in
            browser?.stop()
            browser = nil
            call.resolve()
        }
    }

    /** { gateways }: the routers of the Wi-Fi networks this device is on. On a hotspot, that's the phone sharing it. */
    @objc func gateways(_ call: CAPPluginCall) {
        call.resolve(["gateways": LanNetwork.gateways()])
    }
}
