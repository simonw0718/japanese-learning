// 用 macOS Vision 對圖片做日文 OCR。用法: swift tools/ocr.swift [--flip] img1.jpg img2.jpg ...
import Foundation
import Vision
import AppKit

var args = Array(CommandLine.arguments.dropFirst())
let flip = args.first == "--flip"
if flip { args.removeFirst() }
for path in args {
    guard let img = NSImage(contentsOfFile: path),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLanguages = ["ja-JP", "en-US"]
    req.recognitionLevel = .accurate
    let h = VNImageRequestHandler(cgImage: cg, orientation: flip ? .down : .up)
    try? h.perform([req])
    print("=== \(path)")
    let obs = (req.results ?? []).sorted { $0.boundingBox.minY > $1.boundingBox.minY }
    for o in obs { if let t = o.topCandidates(1).first { print(t.string) } }
}
