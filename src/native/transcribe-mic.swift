import Foundation
import Speech
import AVFoundation

let locale = Locale(identifier: "pt-BR")
guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
  fputs("ERROR: Speech recognizer not available for pt-BR\n", stderr)
  exit(1)
}

let authSemaphore = DispatchSemaphore(value: 0)
var authGranted = false
SFSpeechRecognizer.requestAuthorization { status in
  authGranted = (status == .authorized)
  authSemaphore.signal()
}
authSemaphore.wait()

guard authGranted else {
  fputs("ERROR: Speech recognition not authorized. Go to System Settings > Privacy & Security > Speech Recognition\n", stderr)
  exit(2)
}

let micSemaphore = DispatchSemaphore(value: 0)
var micGranted = false
AVCaptureDevice.requestAccess(for: .audio) { granted in
  micGranted = granted
  micSemaphore.signal()
}
micSemaphore.wait()

guard micGranted else {
  fputs("ERROR: Microphone access not authorized. Go to System Settings > Privacy & Security > Microphone\n", stderr)
  exit(4)
}

let audioEngine = AVAudioEngine()
let request = SFSpeechAudioBufferRecognitionRequest()
request.shouldReportPartialResults = true

let inputNode = audioEngine.inputNode
let recordingFormat = inputNode.outputFormat(forBus: 0)

inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
  request.append(buffer)
}

var lastResultTime = Date()
var finalText = ""
let silenceTimeout: TimeInterval = 2.0

audioEngine.prepare()
do {
  try audioEngine.start()
} catch {
  fputs("ERROR: Failed to start audio engine\n", stderr)
  exit(3)
}

print("LISTENING")
fflush(stdout)

let resultSemaphore = DispatchSemaphore(value: 0)
let stateQueue = DispatchQueue(label: "com.claudefree.dictation.state")
var finished = false

let finishIfNeeded: () -> Void = {
  stateQueue.sync {
    if finished { return }
    finished = true
    resultSemaphore.signal()
  }
}

let task = recognizer.recognitionTask(with: request) { result, error in
  if let result = result {
    finalText = result.bestTranscription.formattedString
    lastResultTime = Date()

    print("PARTIAL:\(finalText)")
    fflush(stdout)

    if result.isFinal {
      finishIfNeeded()
    }
  }

  if error != nil {
    finishIfNeeded()
  }
}

DispatchQueue.global(qos: .userInitiated).async {
  while true {
    Thread.sleep(forTimeInterval: 0.5)

    let shouldBreak = stateQueue.sync { finished }
    if shouldBreak { break }

    if Date().timeIntervalSince(lastResultTime) > silenceTimeout && !finalText.isEmpty {
      task.cancel()
      audioEngine.stop()
      inputNode.removeTap(onBus: 0)
      request.endAudio()
      finishIfNeeded()
      break
    }
  }
}

DispatchQueue.global(qos: .userInitiated).async {
  while let line = readLine() {
    if line.trimmingCharacters(in: .whitespacesAndNewlines) == "STOP" {
      task.cancel()
      audioEngine.stop()
      inputNode.removeTap(onBus: 0)
      request.endAudio()
      finishIfNeeded()
      break
    }
  }
}

resultSemaphore.wait()
print("FINAL:\(finalText)")
fflush(stdout)
exit(0)
