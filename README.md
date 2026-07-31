# Sprint Retro

A real-time sprint retrospective board for teams of up to **15 participants**.

## Features

- **Create or join** a room with a 6-character code
- **Three retro columns**: What Went Well, What To Improve, Action Items
- **Real-time sync** ΓÇö cards, votes, and participants update instantly for everyone
- **Voting** ΓÇö team members can upvote items to prioritize discussion
- **15-user cap** ΓÇö enforced on the server so sessions stay manageable
- **Responsive layout** ΓÇö works on desktop and mobile

## Quick Start

```bash
npm install
npm start
```

Open **http://localhost:3000** in your browser.

### Running a retro

1. One person clicks **Create Room** (enter your name first)
2. Share the room code with the team (click the clipboard icon to copy)
3. Everyone else enters the code and their name, then clicks **Join Room**
4. Add sticky notes to each column, vote on items, and discuss

Open multiple browser tabs or share the link with teammates on the same network to test collaboration.

## Tech Stack

- **Node.js** + **Express** ΓÇö static file serving and REST endpoints
- **Socket.io** ΓÇö WebSocket real-time communication
- Vanilla HTML/CSS/JS ΓÇö no build step required

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `3000`  | Server port |

## Notes

- Rooms are stored in memory and removed 1 hour after the last participant leaves
- Each participant can only delete their own cards
- Duplicate names within a room are not allowed
