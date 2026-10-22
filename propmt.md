You are a senior full-stack software engineer, AI engineer,
and product designer specializing in real-time voice AI agents.

Your task is to DESIGN AND BUILD a fully functional MVP
of an AI-powered Sales Training Platform.

PROJECT NAME: SalesPilot AI
TAGLINE: Practice Smarter. Sell Better.

IMPORTANT:
This is a real commercial MVP intended to be demonstrated
to a potential business client.

The client is looking for a voice AI sales simulator that
can simulate customers, train sales managers, analyze
negotiations, and evaluate sales performance.

The MVP must demonstrate the core product capabilities.

Do NOT create just a static UI or clickable mockup.
Build a genuinely functional application.

==================================================
1. PRODUCT OVERVIEW
==================================================

SalesPilot AI is a web-based AI sales training platform.

Sales representatives practice sales conversations with
AI-powered customers using their microphones.

The AI behaves like a realistic customer:

- Asks questions
- Raises objections
- Expresses doubts
- Negotiates prices
- Reacts naturally
- Changes its attitude based on the salesperson's answers
- May accept or reject an offer

After each training session, another LLM evaluates
the salesperson's performance.

The application provides:

1. Real-time voice conversations
2. Realistic AI customer personalities
3. Sales training scenarios
4. AI-powered conversation analysis
5. Performance scoring
6. Actionable feedback
7. Training history
8. Analytics dashboard

==================================================
2. TECHNOLOGY STACK
==================================================

BACKEND:
- Python 3.11+
- FastAPI
- WebSockets
- Google Gen AI SDK (google-genai)
- Gemini Live API
- Gemini text model for evaluation
- SQLAlchemy
- SQLite for MVP
- Pydantic
- python-dotenv

FRONTEND:
- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide React icons
- Recharts for analytics

AUDIO:
- Browser microphone access
- Web Audio API
- AudioWorklet
- Real-time audio streaming
- PCM16 audio processing
- WebSocket communication

ARCHITECTURE:

React Frontend
       |
       v
FastAPI Backend
       |
       +---- Gemini Live API
       |          |
       |          v
       |    Voice AI Customer
       |
       +---- Gemini Text Model
       |          |
       |          v
       |    Sales Evaluation
       |
       +---- SQLite Database
                  |
                  v
           Training History

IMPORTANT:
Never expose Gemini API keys in the frontend.

All Gemini API requests must go through the backend.

Use the official google-genai Python SDK.
Do not use the deprecated google-generativeai SDK.

Use environment variables to configure model names.
Do not hardcode model identifiers that may become outdated.

Consult the current official Gemini Live API documentation
before implementing the integration.

==================================================
3. APPLICATION DESIGN
==================================================

Create a premium modern SaaS dashboard.

The design should feel like a real commercial AI product.

DESIGN STYLE:

- Modern
- Minimal
- Professional
- Clean typography
- Smooth animations
- Responsive layout
- Dark theme by default
- High-quality UI components

COLOR PALETTE:

Background: #09090B
Sidebar: #111113
Cards: #18181B
Primary: #6366F1
Accent: #818CF8
Success: #22C55E
Warning: #F59E0B
Text: #FAFAFA
Muted: #A1A1AA

Use subtle gradients, rounded cards, and modern spacing.

Avoid an overly complicated interface.

The final UI should look polished enough for a startup
product demonstration.

==================================================
4. APPLICATION PAGES
==================================================

Build the following pages:

PAGE 1: DASHBOARD

Display:

- Total training sessions
- Average sales score
- Total practice duration
- Improvement percentage
- Recent training sessions
- Performance trend chart
- Skills breakdown
- Start Training button

All statistics must come from real stored sessions.

When the database is empty, show a useful empty state.
Do not fabricate training statistics.

PAGE 2: NEW TRAINING

Allow the user to configure a training session.

Fields:

Scenario:
- Price Objection
- Difficult Customer
- Product Comparison
- Closing a Sale

Customer personality:
- Skeptical
- Friendly
- Impatient
- Analytical

Difficulty:
- Easy
- Medium
- Hard

Language:
- English
- Russian

Product/service description:
A text field where the salesperson can describe
what they are selling.

For MVP, provide a default example product:

"CRM software subscription for small businesses."

The AI must use the selected scenario, personality,
difficulty, language, and product context.

Button:
START TRAINING

PAGE 3: LIVE TRAINING SESSION

This is the most important page.

Create a polished real-time voice conversation interface.

DISPLAY:

- AI Customer avatar
- Current scenario
- Customer personality
- Session timer
- Connection status
- Microphone status
- Audio visualization
- Live transcript
- End Session button

VOICE INTERACTION:

The salesperson speaks into their microphone.

The browser captures the audio.

The audio is converted to the required PCM format.

Audio chunks are sent to FastAPI through WebSocket.

The backend forwards the audio to Gemini Live API.

Gemini generates spoken responses.

The backend streams the generated audio back
to the browser.

The browser plays the audio immediately.

The user must be able to have a natural conversation
without pressing a button for every message.

Support interruptions when the underlying model
and SDK provide this capability.

Handle microphone permission errors gracefully.

Handle connection interruptions and API failures.

Display useful error messages.

Do not silently fall back to a fake conversation.

IMPORTANT AUDIO DETAILS:

Follow the current Gemini Live API audio specifications.

For example:
- Input: PCM16, mono, typically 16 kHz
- Output: PCM16, mono, typically 24 kHz

Implement appropriate resampling.

Do not assume the browser's AudioContext automatically
uses 16 kHz.

Use AudioWorklet for reliable audio processing.

Handle audio playback queues and interruptions.

Do not use MediaRecorder WebM/Opus blobs as if
they were raw PCM.

==================================================
5. AI CUSTOMER BEHAVIOR
==================================================

The AI must act like a realistic potential customer.

It is NOT a helpful assistant during the conversation.

It should NOT teach the salesperson while roleplaying.

Instead, it must behave like an actual customer.

Create a dynamic system instruction using:

- Scenario
- Personality
- Difficulty
- Product description
- Conversation language

EXAMPLE SCENARIO:

PRODUCT:
CRM software subscription

CUSTOMER:
Small business owner

PERSONALITY:
Skeptical

MAIN OBJECTION:
The subscription seems too expensive.

CUSTOMER GOAL:
Determine whether the software is worth purchasing.

AI BEHAVIOR:

The AI should:

1. Start with a realistic opening.
2. Ask about the product.
3. Question the value proposition.
4. Raise pricing objections.
5. Ask follow-up questions.
6. React to the salesperson's actual arguments.
7. Become more interested if convinced.
8. Remain skeptical if arguments are weak.
9. Reach a realistic purchasing decision.

Example:

AI CUSTOMER:
"Honestly, your software seems expensive.
Why should I pay $100 per month when there
are cheaper alternatives?"

SALESPERSON:
"Our software saves your team time by
automating repetitive tasks."

AI CUSTOMER:
"Everyone says their software saves time.
Can you give me a specific example?"

The AI must not follow a rigid scripted conversation.

Its responses should depend on the salesperson.

DIFFICULTY:

EASY:
Friendly customer with simple objections.

MEDIUM:
Realistic customer with several objections.

HARD:
Demanding customer who requires specific evidence,
asks difficult questions, and challenges weak claims.

Avoid making the customer unnecessarily rude or abusive.

==================================================
6. REAL-TIME TRANSCRIPT
==================================================

Display the conversation as messages.

Example:

CUSTOMER:
"Why is your product so expensive?"

SALESPERSON:
"Because it provides automated analytics."

CUSTOMER:
"Can you explain how that benefits my company?"

Use actual transcription data from the voice session.

Use Gemini Live input and output transcription
when supported by the selected model and API.

Preserve speaker roles.

Store timestamps where available.

Do not invent transcript messages.

If transcription is unavailable, show an explicit warning
and disable transcript-dependent evaluation.

==================================================
7. END TRAINING
==================================================

When the user clicks END SESSION:

1. Stop microphone capture.
2. Close the Gemini Live connection.
3. Finalize the transcript.
4. Save session data.
5. Trigger AI evaluation.
6. Display evaluation progress.
7. Redirect to the results page when complete.

Use proper cleanup to avoid orphaned audio streams,
WebSocket connections, or background tasks.

==================================================
8. AI SALES EVALUATION
==================================================

After each conversation, send the real transcript
to a Gemini text model for evaluation.

The evaluation model must act as a professional
sales coach.

Evaluate the following categories:

1. Needs Discovery
2. Communication Clarity
3. Objection Handling
4. Value Proposition
5. Closing Skills

Each category receives a score between 0 and 10.

Calculate the overall score on a scale of 0 to 100.

Use equal weighting in the MVP.

Return structured JSON:

{
  "overall_score": 76,
  "categories": {
    "needs_discovery": 8,
    "communication": 7,
    "objection_handling": 6,
    "value_proposition": 9,
    "closing": 8
  },
  "strengths": [
    "Clearly explained the product benefits",
    "Responded calmly to pricing concerns"
  ],
  "weaknesses": [
    "Did not ask enough discovery questions",
    "Failed to confirm the next step"
  ],
  "recommendations": [
    "Ask about the client's current workflow",
    "Use concrete ROI examples",
    "Confirm a specific next step"
  ],
  "summary": "The salesperson communicated the product
  value effectively but needs improvement in
  discovery questions and closing."
}

IMPORTANT:

Use Pydantic to validate structured output.

The overall score must be calculated in Python
from the five category scores.

Do not trust an arbitrary overall_score generated by the LLM.

Require evidence from actual conversation turns
when explaining strengths and weaknesses.

Do not make up quotes or actions that did not occur.

If the conversation is too short for a meaningful
evaluation, return an insufficient_data status.

Never generate random scores.

If the API fails, show an evaluation error and allow retry.

Treat the score as coaching feedback rather than
an objectively validated measurement of sales skill.

==================================================
9. RESULTS PAGE
==================================================

Create an impressive professional evaluation dashboard.

DISPLAY:

OVERALL SCORE:
76/100

CATEGORY SCORES:
- Needs Discovery: 8/10
- Communication: 7/10
- Objection Handling: 6/10
- Value Proposition: 9/10
- Closing Skills: 8/10

VISUALIZATIONS:

- Circular overall score indicator
- Radar chart for skills
- Individual progress bars
- Performance comparison with past sessions

SECTIONS:

WHAT YOU DID WELL
Show strengths.

AREAS TO IMPROVE
Show mistakes.

AI COACH RECOMMENDATIONS
Provide actionable advice.

CONVERSATION TRANSCRIPT
Display the recorded text conversation.

Add a "Practice Again" button.

==================================================
10. TRAINING HISTORY
==================================================

Create a history page containing previous sessions.

Each session displays:

- Date
- Scenario
- Customer personality
- Duration
- Overall score
- Status

Allow the user to open any previous session.

Store sessions using SQLite.

Create SQLAlchemy models.

Suggested entities:

TrainingSession:
- id
- scenario
- personality
- difficulty
- language
- product_description
- started_at
- ended_at
- duration_seconds
- status
- overall_score

TranscriptMessage:
- id
- session_id
- speaker
- content
- timestamp

Evaluation:
- id
- session_id
- overall_score
- category_scores
- strengths
- weaknesses
- recommendations
- summary

Use proper database relationships.

==================================================
11. FASTAPI ENDPOINTS
==================================================

Implement appropriate REST and WebSocket endpoints.

Suggested API:

POST /api/sessions
Create a new session.

GET /api/sessions
Retrieve training history.

GET /api/sessions/{id}
Retrieve session details.

POST /api/sessions/{id}/evaluate
Evaluate a completed session.

GET /api/sessions/{id}/evaluation
Retrieve evaluation results.

GET /api/dashboard
Retrieve dashboard analytics.

GET /api/health
Health check.

WEBSOCKET:

/ws/training/{session_id}

Used for bidirectional real-time communication.

Define a clear WebSocket message protocol.

Handle:
- Connection established
- Audio input
- Audio output
- Transcription updates
- Session termination
- API errors

==================================================
12. SECURITY
==================================================

Never expose Gemini API keys in client-side code.

Use environment variables.

Create:

.env.example

Example:

GEMINI_API_KEY=
GEMINI_LIVE_MODEL=
GEMINI_EVALUATION_MODEL=
DATABASE_URL=sqlite:///./salespilot.db

Never commit .env.

Validate configuration at startup.

Restrict CORS to configured origins.

Do not expose private stack traces to clients.

Limit concurrent sessions.

Add basic safeguards against oversized messages.

Do not log raw audio or sensitive API keys.

For this MVP, use a simple single-user demo mode.

Do not claim enterprise-grade authentication or security.

For production, explain that authentication,
authorization, privacy policies, rate limiting,
and stronger data protection will be required.

==================================================
13. DEMO EXPERIENCE
==================================================

The application is intended to impress a potential
business customer.

The demo must provide a clear journey:

STEP 1:
User opens the dashboard.

STEP 2:
User selects "New Training".

STEP 3:
User configures an AI customer.

STEP 4:
User starts a live voice conversation.

STEP 5:
AI customer responds naturally.

STEP 6:
User ends the conversation.

STEP 7:
Gemini evaluates the actual transcript.

STEP 8:
User receives a professional coaching report.

STEP 9:
Results are saved to training history.

This entire flow must work.

==================================================
14. PROJECT STRUCTURE
==================================================

Use a clean, modular structure.

Example:

salespilot-ai/
|
|-- backend/
|   |-- app/
|   |   |-- main.py
|   |   |-- config.py
|   |   |-- database.py
|   |   |
|   |   |-- api/
|   |   |   |-- sessions.py
|   |   |   |-- evaluation.py
|   |   |   |-- dashboard.py
|   |   |
|   |   |-- services/
|   |   |   |-- gemini_live.py
|   |   |   |-- evaluator.py
|   |   |   |-- scenario_engine.py
|   |   |
|   |   |-- models/
|   |   |-- schemas/
|   |   |-- prompts/
|   |   |
|   |   |-- websocket/
|   |       |-- training.py
|   |
|   |-- requirements.txt
|   |-- .env.example
|
|-- frontend/
|   |-- src/
|   |   |-- components/
|   |   |-- pages/
|   |   |-- hooks/
|   |   |-- services/
|   |   |-- audio/
|   |   |-- types/
|   |   |
|   |   |-- App.tsx
|   |   |-- main.tsx
|   |
|   |-- package.json
|   |-- vite.config.ts
|
|-- README.md
|-- .gitignore

You may improve this architecture when justified.

==================================================
15. IMPLEMENTATION REQUIREMENTS
==================================================

This is NOT a design-only task.

Actually create the source files.

Implement the functionality.

Do not use placeholder functions for the
core AI voice conversation.

Do not replace Gemini Live with fake
pre-recorded audio.

Do not generate fake evaluation results.

Do not use hardcoded demo statistics as real data.

Implement real backend/frontend communication.

Implement actual microphone capture.

Implement actual audio playback.

Implement real Gemini Live integration.

Implement real LLM evaluation.

Implement persistent database storage.

Add appropriate error handling.

If credentials are not available, do not claim
that the external API has been tested.

Provide a clear way for the developer
to configure their own API key.

==================================================
16. TESTING
==================================================

Add tests for:

- Session creation
- Session storage
- Evaluation score calculation
- Evaluation JSON validation
- Scenario prompt generation
- Basic API endpoints

Add mocked tests for Gemini integrations.

Verify:

1. Backend starts.
2. Frontend builds successfully.
3. Pages render correctly.
4. API endpoints return valid responses.
5. WebSocket error handling works.
6. Database persists session data.
7. Evaluation results use real transcripts.

Document which features require live API testing.

==================================================
17. README
==================================================

Write a complete README containing:

1. Project overview
2. Features
3. Technology stack
4. Installation instructions
5. Environment variables
6. Gemini API key setup
7. Backend startup
8. Frontend startup
9. How to start a training session
10. Architecture explanation
11. Testing instructions
12. MVP limitations
13. Future production improvements

Provide commands compatible with Ubuntu Linux.

==================================================
18. DEVELOPMENT WORKFLOW
==================================================

Work in the following order:

PHASE 1:
Initialize the project structure.

PHASE 2:
Implement FastAPI and database models.

PHASE 3:
Implement Gemini Live service.

PHASE 4:
Implement browser microphone capture,
PCM conversion, WebSocket streaming,
and streamed audio playback.

PHASE 5:
Implement the AI customer scenario engine.

PHASE 6:
Implement the evaluation service.

PHASE 7:
Build the React dashboard and training interface.

PHASE 8:
Connect all components.

PHASE 9:
Add testing and error handling.

PHASE 10:
Write documentation and verify startup.

Do not stop after planning.

Do not provide only an architecture explanation.

Write actual working code.

Whenever possible, execute tests and fix errors.

At the end, provide:

- Implemented features
- Project structure
- Exact startup commands
- Environment variables needed
- Tests executed and their results
- Features requiring real API verification
- Known limitations

==================================================
19. DEFINITION OF DONE
==================================================

The MVP is complete when:

1. A user can open the website.
2. A user can create a training session.
3. A user can select a sales scenario.
4. A user can speak through the microphone.
5. Gemini Live can respond with generated speech.
6. A real transcript is collected.
7. The session can be ended safely.
8. The transcript can be evaluated by an LLM.
9. Results appear on the dashboard.
10. Results persist after restarting the application.

If any requirement cannot be completed, explicitly
identify it instead of silently simulating success.

GOAL:

Build a professional, functional, impressive MVP
that can be demonstrated to a real business customer
and later expanded into a commercial sales training SaaS.

START IMPLEMENTING THE PROJECT NOW.
