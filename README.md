# Supreme AI

A sleek Gemini-powered chatbot with a static HTML/CSS/JS frontend and a small Node/Express backend. The API key stays on the server.

## Run locally

1. Install Node.js 20 or newer.
2. Open a terminal in this folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Open `.env` and put your Gemini key after `GEMINI_API_KEY=`.
6. Run `npm start`.
7. Open `http://localhost:3000`.

Never commit `.env` or put your key in files under `public/`.

## Deploy on Render

1. Upload this project folder's contents to a new GitHub repository.
2. In Render, choose **New + → Web Service**, then connect the repository.
3. Render should detect Node. Use:
   - Build command: `npm install`
   - Start command: `npm start`
4. In the Render service's **Environment** settings, add:
   - `GEMINI_API_KEY` = your secret Gemini API key
   - `GEMINI_MODEL` = `gemini-2.5-flash`
5. Deploy. Open the Render URL when deployment completes.

The `render.yaml` file is also included as a reference for the service settings.

## Notes

- Conversation history is saved in the visitor's own browser using localStorage.
- The backend streams generated text from Gemini.
- Free Gemini API access has model-specific rate limits and availability. Check Google's current pricing and usage page.
- This starter has no user accounts, cross-device sync, public rate limiting, or abuse protection. Before sharing it widely, add server-side rate limiting and appropriate access controls.
