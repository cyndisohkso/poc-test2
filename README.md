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
