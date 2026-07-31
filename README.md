# Sprint Retrospective

A real-time sprint retrospective board for distributed teams. No participant limit.

## Features

- **Create or join** a room with a 6-character code
- **Shareable invite links** - send a link and teammates join the room directly
- **Avatars** - every participant gets a coloured initials avatar, shown in the header and on their cards
- **Three retro columns**: What Went Well, What To Improve, Action Items
- **Press Enter to post** a note; Shift+Enter inserts a line break
- **Emoji reactions** - react to anyone's note with 👍 ❤️ 🎉 😄 😟 🔥
- **Spotlight** - put any note centre-screen for everyone so its author can talk the team through it
- **Session timer** - shows how long the room has been running
- **Countdown timer** - pick a preset or custom duration; everyone is nudged on screen when time is up
- **Fixed-height board** - the page never scrolls; each column scrolls independently
- **Real-time sync** - cards, votes, reactions, and participants update instantly for everyone
- **Voting** - team members can upvote items to prioritize discussion
- **Unlimited participants** - room size is not capped
- **Responsive layout** - works on desktop and mobile

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

### Running a retro

1. Enter your name and click **Create Room**
2. A share dialog appears - click **Copy** to grab the invite link
3. Send the link to your team; they only need to enter their name to join
4. Type a note and press **Enter** to post it
5. Vote to prioritise items, and hover a note to add an emoji reaction

You can reopen the share dialog at any time with the **Share link** button in the header.

## Invite links

Rooms are reachable at `/r/<ROOM-CODE>`, for example:

```
http://localhost:3000/r/K7M2QP
```

Opening that URL pre-fills the room code and prompts only for a name. A `?room=<CODE>`
query parameter works too. Once you join, the address bar updates to the invite URL so
you can copy it straight from the browser.

For teammates on other machines, replace `localhost` with your machine's IP address
(run `ipconfig` to find it) and make sure port 3000 is reachable through your firewall.

## Deploying

The app is a single stateful Node process, so it needs a host that supports
WebSockets and can run one always-on instance.

### Render

A `render.yaml` blueprint is included:

1. Sign in at [render.com](https://render.com) with your GitHub account
2. **New** > **Blueprint**, pick this repository, and apply
3. Render installs dependencies, runs `npm start`, and gives you a public URL

Share that URL with your team - invite links work the same way, e.g.
`https://your-app.onrender.com/r/K7M2QP`.

### Important limits

- **Rooms live in memory.** Restarting or redeploying the service destroys any
  retro in progress. Deploy before a session, not during one.
- **Free instances sleep** after ~15 minutes without traffic, and the next
  visitor waits for a cold start. Open the app a minute before your retro.
- **Do not scale past one instance.** Room state is per-process; a second
  instance would put participants in different rooms. Sharing state across
  instances requires the Socket.io Redis adapter.

## Tech Stack

- **Node.js** + **Express** - static file serving and REST endpoints
- **Socket.io** - WebSocket real-time communication
- Vanilla HTML/CSS/JS - no build step required

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |

## Notes

- Rooms are stored in memory and removed 1 hour after the last participant leaves
- Each participant can only delete their own cards
- Duplicate names within a room are not allowed
- Avatar colours are derived from the participant's name, so they stay consistent across rejoins
