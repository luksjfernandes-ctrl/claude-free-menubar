import Foundation
import Speech

guard CommandLine.arguments.count >= 2 else {
  fputs("Usage: transcribe-file <audio-file-path>\n", stderr)
  exit(1)
}

let filePath = CommandLine.arguments[1]
let fileURL = URL(fileURLWithPath: filePath)

guard FileManager.default.fileExists(atPath: filePath) else {
  fputs("ERROR: File not found: \(filePath)\n", stderr)
  exit(1)
}

let locale = Locale(identifier: "pt-BR")
guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
  fputs("ERROR: Speech recognizer not available\n", stderr)
  exit(2)
}

let authSemaphore = DispatchSemaphore(value: 0)
var authGranted = false

SFSpeechRecognizer.requestAuthorization { status in
  authGranted = (status == .authorized)
  authSemaphore.signal()
}
authSemaphore.wait()

guard authGranted else {
  fputs("ERROR: Speech recognition not authorized\n", stderr)
  exit(3)
}

let request = SFSpeechURLRecognitionRequest(url: fileURL)
request.shouldReportPartialResults = false

var finalText = ""
let resultSemaphore = DispatchSemaphore(value: 0)
let stateQueue = DispatchQueue(label: "com.claudefree.transcribe-file.state")
var completed = false

let finish: () -> Void = {
  stateQueue.sync {
    if completed { return }
    completed = true
    resultSemaphore.signal()
  }
}

_ = recognizer.recognitionTask(with: request) { result, error in
  if let result = result, result.isFinal {
    finalText = result.bestTranscription.formattedString
    finish()
    return
  }

  if let error = error {
    fputs("ERROR: \(error.localizedDescription)\n", stderr)
    finish()
  }
}

let timeout = DispatchTime.now() + .seconds(30)
if resultSemaphore.wait(timeout: timeout) == .timedOut {
  fputs("ERROR: Transcription timed out\n", stderr)
  exit(4)
}

print(finalText)
exit(0)
