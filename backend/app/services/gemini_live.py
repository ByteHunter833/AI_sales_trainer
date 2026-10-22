from contextlib import asynccontextmanager

from google import genai
from google.genai import types

from app.services.scenario_engine import customer_instruction


@asynccontextmanager
async def connect_live(settings, training):
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        system_instruction=customer_instruction(training),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        # Automatic activity detection stays enabled for hands-free conversation.
    )
    async with genai.Client(api_key=settings.gemini_api_key.get_secret_value()).aio as client:
        async with client.live.connect(model=settings.gemini_live_model, config=config) as live:
            yield live
