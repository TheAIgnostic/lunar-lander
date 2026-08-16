// Draws the app icon from the same vector geometry the game uses for the ship,
// so the icon and the lander on screen are the same object.
//
//   swift make-icon.swift <output.iconset>

import AppKit

// Ship outline in game space (y grows downward, as in the canvas).
let hull: [(CGFloat, CGFloat)] = [(0, -15), (8, -9), (11, -1), (11, 5), (-11, 5), (-11, -1), (-8, -9)]
let legs: [[(CGFloat, CGFloat)]] = [
    [(-9, 5), (-16, 16)], [(9, 5), (16, 16)],
    [(-20, 16), (-12, 16)], [(12, 16), (20, 16)],
]

let cyan = NSColor(srgbRed: 0.373, green: 0.961, blue: 1.0, alpha: 1)
let amber = NSColor(srgbRed: 1.0, green: 0.702, blue: 0.278, alpha: 1)

func render(_ size: Int) -> Data {
    let s = CGFloat(size)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                              bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                              colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    let gctx = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.current = gctx
    let cg = gctx.cgContext
    cg.setAllowsAntialiasing(true)

    // Rounded plate with the game's sky gradient.
    let inset = s * 0.055
    let plate = CGRect(x: inset, y: inset, width: s - inset * 2, height: s - inset * 2)
    let round = NSBezierPath(roundedRect: plate, xRadius: s * 0.2237, yRadius: s * 0.2237)
    NSGradient(colors: [NSColor(srgbRed: 0.043, green: 0.071, blue: 0.149, alpha: 1),
                        NSColor(srgbRed: 0.012, green: 0.016, blue: 0.031, alpha: 1)])!
        .draw(in: round, angle: -90)

    round.addClip()

    // A few stars.
    var seed: UInt64 = 0x9E3779B9
    func rnd() -> CGFloat {
        seed = seed &* 6364136223846793005 &+ 1442695040888963407
        return CGFloat((seed >> 33) % 10000) / 10000
    }
    for _ in 0..<26 {
        let r = s * (0.004 + rnd() * 0.006)
        NSColor(white: 0.85, alpha: 0.25 + rnd() * 0.5).setFill()
        NSBezierPath(ovalIn: CGRect(x: rnd() * s, y: s * 0.45 + rnd() * s * 0.5, width: r, height: r)).fill()
    }

    // Ground curve along the bottom.
    let ground = NSBezierPath()
    ground.move(to: CGPoint(x: 0, y: s * 0.20))
    ground.curve(to: CGPoint(x: s, y: s * 0.17),
                 controlPoint1: CGPoint(x: s * 0.35, y: s * 0.28),
                 controlPoint2: CGPoint(x: s * 0.62, y: s * 0.10))
    ground.lineWidth = max(1, s * 0.014)
    cg.setShadow(offset: .zero, blur: s * 0.03, color: cyan.withAlphaComponent(0.9).cgColor)
    cyan.withAlphaComponent(0.85).setStroke()
    ground.stroke()
    cg.setShadow(offset: .zero, blur: 0, color: nil)

    // Ship, drawn from the game's own polygon. Game y is flipped for AppKit.
    let k = s * 0.0165
    let cx = s * 0.5
    let cy = s * 0.56
    func p(_ pt: (CGFloat, CGFloat)) -> CGPoint { CGPoint(x: cx + pt.0 * k, y: cy - pt.1 * k) }

    // Exhaust plume first, so the hull sits on top.
    let flame = NSBezierPath()
    flame.move(to: p((-6, 8)))
    flame.line(to: p((6, 8)))
    flame.line(to: p((0, 30)))
    flame.close()
    NSGradient(colors: [amber, NSColor(srgbRed: 1, green: 0.2, blue: 0.15, alpha: 0.0)])!
        .draw(in: flame, angle: -90)

    let body = NSBezierPath()
    body.move(to: p(hull[0]))
    for pt in hull.dropFirst() { body.line(to: p(pt)) }
    body.close()
    NSColor(srgbRed: 0.04, green: 0.10, blue: 0.157, alpha: 0.95).setFill()
    body.fill()
    body.lineWidth = max(1, s * 0.022)
    body.lineJoinStyle = .round
    cg.setShadow(offset: .zero, blur: s * 0.045, color: cyan.cgColor)
    cyan.setStroke()
    body.stroke()

    for leg in legs {
        let l = NSBezierPath()
        l.move(to: p(leg[0]))
        l.line(to: p(leg[1]))
        l.lineWidth = max(1, s * 0.019)
        l.lineCapStyle = .round
        l.stroke()
    }
    cg.setShadow(offset: .zero, blur: 0, color: nil)

    // Window
    NSColor(srgbRed: 0.75, green: 0.97, blue: 1, alpha: 1).setFill()
    let w = s * 0.055
    NSBezierPath(ovalIn: CGRect(x: cx - w / 2, y: cy + 6 * k - w / 2, width: w, height: w)).fill()

    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset"
try? FileManager.default.createDirectory(atPath: out, withIntermediateDirectories: true)

let variants: [(String, Int)] = [
    ("icon_16x16.png", 16), ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32), ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128), ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256), ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512), ("icon_512x512@2x.png", 1024),
]
for (name, px) in variants {
    try! render(px).write(to: URL(fileURLWithPath: "\(out)/\(name)"))
}
print("wrote \(variants.count) icon sizes to \(out)")
