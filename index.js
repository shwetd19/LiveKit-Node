require("dotenv").config();
const WebSocket = require("ws");
const axios = require("axios"); // Ensure axios is installed and required
const { OpenAI } = require("openai");
const { Deepgram } = require("@deepgram/sdk");

// Initialize OpenAI and Deepgram clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Deepgram with the correct format
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

// WebSocket connection
const ws = new WebSocket(process.env.LIVEKIT_URL);

class AssistantFunction {
  async image(userMsg) {
    console.log(`Message triggering vision capabilities: ${userMsg}`);
    return null;
  }
}

async function entrypoint() {
  ws.on("open", () => {
    console.log("Connected to LiveKit");
    joinRoom();
  });

  ws.on("message", async (data) => {
    const msg = JSON.parse(data);
    if (msg.type === "message_received") {
      await _answer(msg.message, false);
    } else if (msg.type === "function_calls_finished") {
      const userMsg = msg.called_functions[0]?.call_info.arguments.user_msg;
      if (userMsg) {
        await _answer(userMsg, true);
      } else {
        console.log("No user message found in function call arguments");
      }
    }
  });

  async function joinRoom() {
    try {
      const response = await axios.post(`${process.env.LIVEKIT_URL}/join`, {
        apiKey: process.env.LIVEKIT_API_KEY,
        secret: process.env.LIVEKIT_API_SECRET,
      });
      console.log(`Joined room: ${response.data.name}`);
    } catch (error) {
      console.error(`Error joining room: ${error.message}`);
    }
  }

  const assistantFunction = new AssistantFunction();

  const chatContext = {
    messages: [
      {
        role: "system",
        content: "Your name is Alloy. You are a funny, witty bot...",
      },
    ],
  };

  async function _answer(text, useImage = false) {
    console.log(`Answering: ${text}`);
    const content = [text];
    if (useImage) {
      const latestImage = await getVideoTrack(); // Implement this method as needed
      if (latestImage) {
        content.push({ image: latestImage });
      }
    }
    chatContext.messages.push({ role: "user", content });

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: chatContext.messages,
      });
      const stream = response.choices[0].message.content;
      console.log(stream);

      // Update this part based on the new SDK documentation
      const transcription = await deepgram.transcription.preRecorded({
        audio_url: stream, // Ensure this is correct as per new SDK
      });
      console.log(transcription);
    } catch (err) {
      console.error(`Error answering: ${err.message}`);
    }
  }

  await _answer("Hi there! How can I help?", true);

  while (true) {
    const videoTrack = await getVideoTrack();
    if (videoTrack) {
      // Process the video stream
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait before retrying
    }
  }
}

entrypoint().catch(console.error);
