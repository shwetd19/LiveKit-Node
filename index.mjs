import { Deepgram } from "@deepgram/sdk";
import OpenAI from "openai";
import { LiveKitClient } from "livekit-client";
import {
  VoiceAssistant,
  ChatContext,
  ChatMessage,
  ChatImage,
} from "livekit-sdk"; // Assuming a similar package or create a custom implementation

// Configure environment variables
const {
  LIVEKIT_URL,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  DEEPGRAM_API_KEY,
  OPENAI_API_KEY,
} = process.env;

// Initialize Deepgram
const deepgram = new Deepgram(DEEPGRAM_API_KEY);

// Initialize OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Create a LiveKit Client
const livekitClient = new LiveKitClient(LIVEKIT_URL, {
  apiKey: LIVEKIT_API_KEY,
  apiSecret: LIVEKIT_API_SECRET,
});

class AssistantFunction {
  async image(userMsg) {
    console.log(`Message triggering vision capabilities: ${userMsg}`);
    return null;
  }
}

async function getVideoTrack(room) {
  // Implement function to get the first video track from the room
  return new Promise((resolve, reject) => {
    for (const participant of Object.values(room.remoteParticipants)) {
      for (const track of Object.values(participant.trackPublications)) {
        if (track.track && track.track.kind === "video") {
          resolve(track.track);
          console.log(`Using video track ${track.track.sid}`);
          return;
        }
      }
    }
    setTimeout(
      () => reject(new Error("Timed out waiting for video track")),
      10000
    );
  });
}

async function entrypoint(ctx) {
  await ctx.connect();
  console.log(`Room name: ${ctx.room.name}`);

  const chatContext = new ChatContext({
    messages: [
      new ChatMessage({
        role: "system",
        content:
          "Your name is Alloy. You are a funny, witty bot. Your interface with users will be voice and vision. Respond with short and concise answers. Avoid using unpronounceable punctuation or emojis.",
      }),
    ],
  });

  const gpt = openai.chat.completions.create.bind(openai.chat.completions);

  const latestImage = null;
  const assistantFunction = new AssistantFunction();

  const assistant = new VoiceAssistant({
    vad: silero.VAD.load(),
    stt: deepgram.transcription,
    llm: gpt,
    tts: new openai.TTS(),
    fnc_ctx: assistantFunction,
    chat_ctx: chatContext,
  });

  const chat = new ChatManager(ctx.room);

  async function _answer(text, useImage = false) {
    console.log(`Answering: ${text}`);
    const content = [text];
    if (useImage && latestImage) {
      content.push(new ChatImage({ image: latestImage }));
    }
    chatContext.messages.push(new ChatMessage({ role: "user", content }));

    try {
      const response = await gpt({
        model: "gpt-4",
        messages: chatContext.messages,
      });
      const stream = response.choices[0].message.content;
      console.log(stream);
      await assistant.say(stream, { allowInterruptions: true });
    } catch (err) {
      console.error(`Error answering: ${err.message}`);
    }
  }

  chat.on("message_received", async (msg) => {
    if (msg.message) {
      await _answer(msg.message, false);
    }
  });

  assistant.on("function_calls_finished", async (calledFunctions) => {
    if (!calledFunctions.length) return;

    const userMsg = calledFunctions[0]?.callInfo?.arguments?.user_msg;
    if (userMsg) {
      await _answer(userMsg, true);
    } else {
      console.log("No user message found in function call arguments");
    }
  });

  assistant.start(ctx.room);

  await _answer("Hi there! How can I help?", true);

  while (ctx.room.connectionState === "connected") {
    const videoTrack = await getVideoTrack(ctx.room);

    if (videoTrack) {
      for await (const event of videoTrack.stream()) {
        latestImage = event.frame;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

// Assuming the CLI and WorkerOptions are available or you can use a custom implementation
const cli = {
  runApp: async (options) => {
    const ctx = await livekitClient.connect(); // Connect to LiveKit
    await entrypoint(ctx);
  },
};

cli.runApp({ entrypoint_fnc: entrypoint });
