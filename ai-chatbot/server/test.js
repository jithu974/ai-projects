import { GoogleGenAI } from "@google/genai";

// Initialize with your actual AI Studio AQ. key
const ai = new GoogleGenAI({
  apiKey: "AQ.Ab8RN6KZwcpz53SXywZzpq2pt9_V3Z4QDfRSDi_jHtTeEzEyJQ", 
});

async function runTest() {
  const modelName = "gemini-3.8-flash";
  const textPrompt = "Explain JavaScript event loops in one simple paragraph.";

  console.log(`📡 Sending prompt to ${modelName}...`);

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: textPrompt,
    });

    console.log("\n✅ Response Received:");
    console.log(response.text);

  } catch (error) {
    console.error("\n❌ API Error Occurred:");
    
    // Check for transient 503 server load drops
    if (error.status === 503 || error.message?.includes("503")) {
      console.warn("⚠️ Server is congested. Attempting fallback request to Lite model...");
      try {
        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-3.5-flash-lite-lite", // Fallback variant
          contents: textPrompt,
        });
        console.log("\n✅ Fallback Response Received:");
        console.log(fallbackResponse.text);
      } catch (fallbackError) {
        console.error("❌ Fallback model also failed:", fallbackError.message);
      }
    } else {
      console.error(`Error Code: ${error.status || 'Unknown'}`);
      console.error(`Message: ${error.message}`);
    }
  }
}

runTest();
////"commonjs"