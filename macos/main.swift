// TERMINAL VELOCITY — macOS shell.
// A native window hosting the bundled single-file build in a WKWebView.
// The game code is unchanged; this only gives it a Dock icon, a real window,
// and a menu bar.
//
// Run with --selftest to load the page headlessly, assert the game booted,
// print the result and exit — that is the build's smoke test.

import AppKit
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    let selfTest = CommandLine.arguments.contains("--selftest")

    func applicationDidFinishLaunching(_ note: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.mediaTypesRequiringUserActionForPlayback = []   // WebAudio still needs a gesture; this just avoids extra gating

        if selfTest {
            // Capture module-init failures, which otherwise surface only as a
            // missing global by the time the probe runs.
            let trap = "window.addEventListener('error', e => { window.__bootError = (e.message||'') + ' @' + (e.filename||'') + ':' + e.lineno; });"
            cfg.userContentController.addUserScript(
                WKUserScript(source: trap, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }

        let frame = NSRect(x: 0, y: 0, width: 1280, height: 800)
        web = WKWebView(frame: frame, configuration: cfg)
        web.navigationDelegate = self
        web.autoresizingMask = [.width, .height]
        web.allowsBackForwardNavigationGestures = false
        if #available(macOS 12.0, *) {
            web.underPageBackgroundColor = NSColor(srgbRed: 0.02, green: 0.024, blue: 0.047, alpha: 1)
        }

        window = NSWindow(contentRect: frame,
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered,
                          defer: false)
        window.title = "TERMINAL VELOCITY"
        window.contentView = web
        window.minSize = NSSize(width: 720, height: 480)
        window.backgroundColor = NSColor(srgbRed: 0.02, green: 0.024, blue: 0.047, alpha: 1)
        window.setFrameAutosaveName("TerminalVelocityMain")
        window.center()
        window.collectionBehavior.insert(.fullScreenPrimary)

        guard let url = Bundle.main.url(forResource: "game", withExtension: "html") else {
            fputs("game.html missing from app bundle\n", stderr)
            exit(3)
        }
        web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

        buildMenu()

        if selfTest {
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) {
                fputs("SELFTEST TIMEOUT\n", stderr)
                exit(2)
            }
        } else {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

    func webView(_ view: WKWebView, didFinish navigation: WKNavigation!) {
        guard selfTest else { return }
        probe(attempt: 0)
    }

    /// Module scripts finish after the load event, so poll rather than assume.
    private func probe(attempt: Int) {
        let js = """
        (function () {
          if (window.__bootError) return 'BOOTERROR ' + window.__bootError;
          if (!window.__game) return 'PENDING';
          return [__game.state, document.styleSheets.length, __game.ship ? 'ship' : 'no-ship'].join('|');
        })()
        """
        web.evaluateJavaScript(js) { result, error in
            let s = result as? String ?? "eval-failed \(String(describing: error))"
            if s.hasPrefix("menu|1|ship") {
                print("SELFTEST OK  \(s)")
                exit(0)
            }
            if s == "PENDING", attempt < 40 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { self.probe(attempt: attempt + 1) }
                return
            }
            fputs("SELFTEST FAIL  \(s)\n", stderr)
            exit(1)
        }
    }

    func webView(_ view: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        fputs("navigation failed: \(error)\n", stderr)
        if selfTest { exit(1) }
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About TERMINAL VELOCITY", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let prefs = NSMenuItem(title: "Settings…", action: #selector(openSettings), keyEquivalent: ",")
        prefs.keyEquivalentModifierMask = [.command]
        prefs.target = self
        appMenu.addItem(prefs)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let gameItem = NSMenuItem()
        let gameMenu = NSMenu(title: "Game")
        let reload = NSMenuItem(title: "Restart Game", action: #selector(reloadGame), keyEquivalent: "r")
        reload.keyEquivalentModifierMask = [.command]
        reload.target = self
        gameMenu.addItem(reload)
        gameMenu.addItem(.separator())
        let full = NSMenuItem(title: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        full.keyEquivalentModifierMask = [.command, .control]
        gameMenu.addItem(full)
        gameItem.submenu = gameMenu
        main.addItem(gameItem)

        NSApp.mainMenu = main
    }

    @objc private func reloadGame() {
        web.reload()
    }

    /// Cmd-, opens the game's own settings screen, pausing a flight in progress.
    @objc private func openSettings() {
        web.evaluateJavaScript("window.__openSettings && window.__openSettings()", completionHandler: nil)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
