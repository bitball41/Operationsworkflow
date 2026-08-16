import { Conversation } from "@elevenlabs/client";

const AGENT_ID = "agent_0601m03x56kfem6aewpz3axj7shz";

const panel = document.querySelector("#call-panel");
const canvas = document.querySelector("#audio-visualizer");
const startButton = document.querySelector("#start-demo");
const startButtonLabel = startButton.querySelector("span");
const sessionControls = document.querySelector("#session-controls");
const muteButton = document.querySelector("#mute-toggle");
const muteButtonLabel = muteButton.querySelector("span");
const endButton = document.querySelector("#end-demo");
const statusBadge = document.querySelector("#status-badge");
const statusTitle = document.querySelector("#status-title");
const statusCopy = document.querySelector("#status-copy");
const errorMessage = document.querySelector("#error-message");
const errorCopy = document.querySelector("#error-copy");

const STATUS_CONTENT = Object.freeze({
  idle: {
    badge: "Ready",
    title: "Say hello to Michael",
    copy: "Start the demo, then speak naturally. He’ll take it from there.",
  },
  connecting: {
    badge: "Connecting",
    title: "Connecting to Michael",
    copy: "Opening a secure voice session. This usually takes just a moment.",
  },
  listening: {
    badge: "Listening",
    title: "Michael is listening",
    copy: "Go ahead—ask a question or describe what you need.",
  },
  speaking: {
    badge: "Speaking",
    title: "Michael is speaking",
    copy: "You can interrupt naturally, just like a real phone conversation.",
  },
  muted: {
    badge: "Muted",
    title: "Your microphone is muted",
    copy: "Unmute when you’re ready for Michael to hear you again.",
  },
  ending: {
    badge: "Ending",
    title: "Ending the demo",
    copy: "Closing the voice session and releasing your microphone.",
  },
  ended: {
    badge: "Complete",
    title: "Thanks for talking with Michael",
    copy: "Want another try? Start a fresh demo whenever you’re ready.",
  },
  error: {
    badge: "Unavailable",
    title: "Michael couldn’t connect",
    copy: "Check the message below, then try the demo again.",
  },
});

let conversation = null;
let currentState = "idle";
let currentMode = "listening";
let isMuted = false;
let endingByUser = false;
let animationFrame = 0;

function updateState(state) {
  const content = STATUS_CONTENT[state] || STATUS_CONTENT.idle;
  currentState = state;
  panel.dataset.state = state;
  statusBadge.lastChild.textContent = ` ${content.badge}`;
  statusTitle.textContent = content.title;
  statusCopy.textContent = content.copy;
}

function setSessionControls(active) {
  startButton.hidden = active;
  sessionControls.hidden = !active;
  muteButton.disabled = !active;
  endButton.disabled = !active;
}

function clearError() {
  errorMessage.hidden = true;
  errorCopy.textContent = "";
}

function describeError(error) {
  const name = error?.name || "";
  const message = String(error?.message || error || "");

  if (name === "NotAllowedError" || /permission|not allowed/i.test(message)) {
    return "Microphone access was blocked. Allow microphone access for this site in your browser, then try again.";
  }
  if (name === "NotFoundError" || /requested device not found|no microphone/i.test(message)) {
    return "No microphone was found. Connect or enable a microphone, then try again.";
  }
  if (name === "NotReadableError" || /could not start audio source|device in use/i.test(message)) {
    return "Your microphone is busy in another app. Close the other call or recording, then try again.";
  }
  if (/401|authentication enabled|conversation token/i.test(message)) {
    return "This demo is not available for public web calls yet. The ElevenLabs agent must allow this domain before Michael can connect.";
  }
  if (!window.isSecureContext) {
    return "Microphone access requires a secure HTTPS connection. Reload this demo over HTTPS and try again.";
  }
  return "The voice session could not start. Check your connection and microphone, then try again.";
}

function showError(error) {
  console.error("Voice demo error", error);
  errorCopy.textContent = describeError(error);
  errorMessage.hidden = false;
  updateState("error");
}

function resetMute() {
  isMuted = false;
  muteButton.setAttribute("aria-pressed", "false");
  muteButtonLabel.textContent = "Mute";
}

function finishSession(state = "ended") {
  conversation = null;
  endingByUser = false;
  resetMute();
  setSessionControls(false);
  startButton.disabled = false;
  startButtonLabel.textContent = state === "error" ? "Try Again" : "Start Again";
  if (state !== "error") clearError();
  updateState(state);
}

async function requestMicrophone() {
  if (!window.isSecureContext && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    throw new Error("Microphone access requires a secure connection.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone access.");
  }

  const permissionStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  permissionStream.getTracks().forEach((track) => track.stop());
}

async function startDemo() {
  if (conversation || startButton.disabled) return;

  clearError();
  resetMute();
  endingByUser = false;
  startButton.disabled = true;
  startButtonLabel.textContent = "Connecting…";
  updateState("connecting");

  try {
    await requestMicrophone();

    conversation = await Conversation.startSession({
      agentId: AGENT_ID,
      connectionType: "webrtc",
      onConversationCreated: (session) => {
        conversation = session;
      },
      onConnect: () => {
        setSessionControls(true);
        updateState(currentMode === "speaking" ? "speaking" : "listening");
      },
      onStatusChange: ({ status }) => {
        if (status === "connecting") updateState("connecting");
        if (status === "disconnecting" && !endingByUser) updateState("ending");
      },
      onModeChange: ({ mode }) => {
        currentMode = mode;
        if (isMuted) updateState("muted");
        else updateState(mode === "speaking" ? "speaking" : "listening");
      },
      onError: (message, context) => {
        showError(context instanceof Error ? context : new Error(message));
      },
      onDisconnect: (details) => {
        if (endingByUser || details?.reason === "user") {
          finishSession("ended");
          return;
        }
        if (details?.reason === "error") {
          showError(new Error(details.message || "The voice connection ended unexpectedly."));
          finishSession("error");
          return;
        }
        finishSession("ended");
      },
    });
  } catch (error) {
    showError(error);
    if (conversation) await conversation.endSession().catch(() => {});
    finishSession("error");
  }
}

function toggleMute() {
  if (!conversation) return;
  isMuted = !isMuted;
  conversation.setMicMuted(isMuted);
  muteButton.setAttribute("aria-pressed", String(isMuted));
  muteButtonLabel.textContent = isMuted ? "Unmute" : "Mute";
  updateState(isMuted ? "muted" : currentMode === "speaking" ? "speaking" : "listening");
}

async function endDemo() {
  if (!conversation || endingByUser) return;
  endingByUser = true;
  muteButton.disabled = true;
  endButton.disabled = true;
  updateState("ending");

  try {
    await conversation.endSession();
    if (conversation) finishSession("ended");
  } catch (error) {
    showError(error);
    finishSession("error");
  }
}

function frequencyAt(data, position) {
  if (!data?.length) return 0;
  const start = Math.floor(position * data.length);
  const windowSize = Math.max(1, Math.floor(data.length / 48));
  let total = 0;
  for (let index = start; index < Math.min(data.length, start + windowSize); index += 1) {
    total += data[index];
  }
  return total / windowSize / 255;
}

function visualizerColor() {
  if (currentState === "speaking") return [110, 207, 156];
  if (currentState === "muted") return [232, 180, 92];
  if (currentState === "error") return [239, 141, 132];
  return [107, 143, 247];
}

function drawVisualizer(time = 0) {
  const context = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.34;
  const bars = 52;
  const color = visualizerColor();
  let frequencyData = null;

  if (conversation && ["listening", "speaking"].includes(currentState)) {
    try {
      frequencyData = currentState === "speaking"
        ? conversation.getOutputByteFrequencyData()
        : conversation.getInputByteFrequencyData();
    } catch {
      frequencyData = null;
    }
  }

  for (let index = 0; index < bars; index += 1) {
    const angle = (index / bars) * Math.PI * 2 - Math.PI / 2;
    const mirroredPosition = index <= bars / 2 ? index / (bars / 2) : (bars - index) / (bars / 2);
    const measured = frequencyAt(frequencyData, mirroredPosition * 0.82);
    const idleWave = 0.08 + ((Math.sin(time / 560 + index * 0.62) + 1) * 0.025);
    const activity = frequencyData ? Math.max(0.055, measured * 0.72) : idleWave;
    const barLength = Math.min(baseRadius * 0.72, baseRadius * activity);
    const inner = baseRadius + 6 * ratio;
    const outer = inner + Math.max(2 * ratio, barLength);
    const x1 = centerX + Math.cos(angle) * inner;
    const y1 = centerY + Math.sin(angle) * inner;
    const x2 = centerX + Math.cos(angle) * outer;
    const y2 = centerY + Math.sin(angle) * outer;

    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.lineWidth = 2 * ratio;
    context.lineCap = "round";
    context.strokeStyle = `rgba(${color.join(",")}, ${frequencyData ? 0.46 + measured * 0.5 : 0.28})`;
    context.stroke();
  }

  animationFrame = window.requestAnimationFrame(drawVisualizer);
}

startButton.addEventListener("click", startDemo);
muteButton.addEventListener("click", toggleMute);
endButton.addEventListener("click", endDemo);
window.addEventListener("beforeunload", () => {
  window.cancelAnimationFrame(animationFrame);
  if (conversation) conversation.endSession().catch(() => {});
});

const previewState = new URLSearchParams(window.location.search).get("previewState");
if (["localhost", "127.0.0.1"].includes(window.location.hostname) && STATUS_CONTENT[previewState]) {
  updateState(previewState);
  if (["listening", "speaking", "muted"].includes(previewState)) setSessionControls(true);
  if (previewState === "error") {
    errorCopy.textContent = "Microphone access was blocked. Allow microphone access for this site in your browser, then try again.";
    errorMessage.hidden = false;
  }
}

drawVisualizer();
