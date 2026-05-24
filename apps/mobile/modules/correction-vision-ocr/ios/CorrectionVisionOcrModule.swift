import ExpoModulesCore
import UIKit
import Vision

public class CorrectionVisionOcrModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CorrectionVisionOcr")

    AsyncFunction("recognizeText") { (imageUri: String, promise: Promise) in
      guard let image = Self.loadImage(from: imageUri), let cgImage = image.cgImage else {
        promise.reject("IMAGE_LOAD_FAILED", "Could not load image for OCR")
        return
      }

      let request = VNRecognizeTextRequest { request, error in
        if let error {
          promise.reject("VISION_OCR_FAILED", error.localizedDescription)
          return
        }

        let observations = request.results as? [VNRecognizedTextObservation] ?? []
        let candidates = observations.compactMap { observation -> VNRecognizedText? in
          observation.topCandidates(1).first
        }
        let rawText = candidates.map(\.string).joined(separator: "\n")
        let confidence = candidates.isEmpty
          ? 0
          : candidates.map(\.confidence).reduce(0, +) / Float(candidates.count)

        promise.resolve([
          "rawText": rawText,
          "confidence": confidence
        ])
      }

      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      request.recognitionLanguages = ["zh-Hans", "en-US"]

      DispatchQueue.global(qos: .userInitiated).async {
        do {
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])
        } catch {
          promise.reject("VISION_OCR_FAILED", error.localizedDescription)
        }
      }
    }
  }

  private static func loadImage(from imageUri: String) -> UIImage? {
    if imageUri.hasPrefix("file://"), let url = URL(string: imageUri) {
      return UIImage(contentsOfFile: url.path)
    }

    if let url = URL(string: imageUri), url.isFileURL {
      return UIImage(contentsOfFile: url.path)
    }

    return UIImage(contentsOfFile: imageUri)
  }
}
