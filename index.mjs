import dotenv from "dotenv";
import WebSocket from "ws";
import axios from "axios";
import { Deepgram } from "@deepgram/sdk";
import OpenAI from "openai";
import {
  Room,
  Participant,
  TrackPublication,
  RemoteTrack,
} from "livekit-server-sdk";

dotenv.config();

const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

class AssistantFunction {
  async image(userMsg) {
    console.log(`Message triggering vision capabilities: ${userMsg}`);
    return null;
  }
}

async function getVideoTrack(room) {
  const videoTrackFuture = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject("Timed out waiting for video track"),
      10000
    );

    for (const participant of Object.values(room.remoteParticipants)) {
      for (const trackPublication of Object.values(
        participant.trackPublications
      )) {
        if (
          trackPublication.track &&
          trackPublication.track instanceof RemoteTrack
        ) {
          clearTimeout(timer);
          resolve(trackPublication.track);
          console.log(`Using video track ${trackPublication.track.sid}`);
          return;
        }
      }
    }
  });

  try {
    return await videoTrackFuture;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function entrypoint(ctx) {
  await ctx.connect();
  console.log(`Room name: ${ctx.room.name}`);

  const chatContext = {
    messages: [
      {
        role: "system",
        content:
          "Your name is Alloy. You are a funny, witty bot. Your interface with users will be voice and vision. Respond with short and concise answers. Avoid using unpronouncable punctuation or emojis.",
      },
    ],
  };

  const gpt = new openai.ChatCompletion({
    model: "gpt-4",
  });

  const latestImage = null;

  const assistantFunction = new AssistantFunction();

  async function _answer(text, useImage = false) {
    console.log(`Answering: ${text}`);
    const content = [text];
    if (useImage && latestImage) {
      content.push({ image: latestImage });
    }
    chatContext.messages.push({ role: "user", content });

    try {
      const response = await gpt.create({
        messages: chatContext.messages,
      });

      const stream = response.choices[0].message.content;
      console.log(stream);

      const transcription = await deepgram.transcription.preRecorded({
        audio_url: stream,
      });

      console.log(transcription);
    } catch (err) {
      console.error(`Error answering: ${err.message}`);
    }
  }

  const chat = new Room(ctx.room);

  chat.on("message_received", (msg) => {
    if (msg.message) {
      _answer(msg.message, false);
    }
  });

  assistantFunction.on("function_calls_finished", async (calledFunctions) => {
    if (!calledFunctions.length) return;

    const userMsg = calledFunctions[0]?.callInfo.arguments?.user_msg;
    if (userMsg) {
      await _answer(userMsg, true);
    } else {
      console.log("No user message found in function call arguments");
    }
  });

  assistantFunction.start(ctx.room);

  await _answer("Hi there! How can I help?", true);

  while (ctx.room.connectionState === "connected") {
    const videoTrack = await getVideoTrack(ctx.room);
    if (videoTrack) {
      for await (const event of videoTrack) {
        latestImage = event.frame;
      }
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const ws = new WebSocket(process.env.LIVEKIT_URL);

ws.on("open", () => {
  console.log("Connected to LiveKit");
  // Call entrypoint here with the necessary context
});

ws.on("message", (data) => {
  const msg = JSON.parse(data);
  if (msg.type === "message_received") {
    // Handle message received
  } else if (msg.type === "function_calls_finished") {
    // Handle function calls finished
  }
});
