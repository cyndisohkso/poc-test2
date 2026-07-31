const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const rooms = new Map();

const COLUMNS = ['went-well', 'improve', 'action-items'];
const REACTIONS = ['👍', '❤️', '🎉', '😄', '😟', '🔥'];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const AVATAR_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
  '#8b5cf6', '#06b6d4', '#ef4444', '#22c55e',
  '#a855f7', '#3b82f6', '#f97316', '#10b981',
  '#e11d48', '#0ea5e9', '#84cc16', '#d946ef',
  '#f43f5e', '#2dd4bf', '#eab308', '#7c3aed',
];

// Hash the name so a participant keeps the same avatar colour across rejoins.
function colorForName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function createRoom(code) {
  return {
    code,
    cards: [],
    participants: new Map(),
    // Retained for the lifetime of the room so reactions can still name people who left.
    people: new Map(),
    spotlightCardId: null,
    timer: null,
    timerHandle: null,
    createdAt: Date.now(),
  };
}

function getRoomState(room) {
  return {
    code: room.code,
    cards: room.cards,
    participants: Array.from(room.participants.values()),
    people: Array.from(room.people.values()),
    spotlightCardId: room.spotlightCardId,
    timer: room.timer,
    createdAt: room.createdAt,
    reactions: REACTIONS,
  };
}

const MAX_TIMER_SECONDS = 4 * 60 * 60;

function stopRoomTimer(room) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = null;
  }
}

function broadcastRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room) {
    io.to(roomCode).emit('room-update', getRoomState(room));
  }
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/room/:code/exists', (req, res) => {
  res.json({ exists: rooms.has(req.params.code.toUpperCase()) });
});

// Invite links land here; the client reads the code out of the path.
app.get('/r/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  let currentRoom = null;
  let participantId = null;

  socket.on('create-room', (callback) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    rooms.set(code, createRoom(code));
    callback({ success: true, code });
  });

  socket.on('join-room', ({ code, name }, callback) => {
    code = code.toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      callback({ success: false, error: 'Room not found. Check the code and try again.' });
      return;
    }

    const trimmedName = (name || '').trim().slice(0, 30);
    if (!trimmedName) {
      callback({ success: false, error: 'Please enter your name.' });
      return;
    }

    const isDuplicate = Array.from(room.participants.values()).some(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      callback({ success: false, error: 'That name is already taken in this room.' });
      return;
    }

    participantId = socket.id;
    currentRoom = code;

    const person = {
      id: participantId,
      name: trimmedName,
      color: colorForName(trimmedName),
      initials: getInitials(trimmedName),
    };

    room.participants.set(participantId, { ...person, joinedAt: Date.now() });
    room.people.set(participantId, person);

    socket.join(code);
    callback({ success: true, participantId, room: getRoomState(room) });
    broadcastRoom(code);
  });

  socket.on('add-card', ({ column, text }) => {
    if (!currentRoom || !COLUMNS.includes(column)) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const trimmedText = text.trim().slice(0, 500);
    if (!trimmedText) return;

    const participant = room.participants.get(participantId);
    if (!participant) return;

    const card = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      column,
      text: trimmedText,
      authorId: participantId,
      authorName: participant.name,
      authorColor: participant.color,
      authorInitials: participant.initials,
      votes: [],
      reactions: {},
      createdAt: Date.now(),
    };

    room.cards.push(card);
    broadcastRoom(currentRoom);
  });

  socket.on('delete-card', ({ cardId }) => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const cardIndex = room.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    const card = room.cards[cardIndex];
    if (card.authorId !== participantId) return;

    room.cards.splice(cardIndex, 1);
    if (room.spotlightCardId === cardId) room.spotlightCardId = null;
    broadcastRoom(currentRoom);
  });

  socket.on('toggle-vote', ({ cardId }) => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const card = room.cards.find((c) => c.id === cardId);
    if (!card) return;

    const voteIndex = card.votes.indexOf(participantId);
    if (voteIndex === -1) {
      card.votes.push(participantId);
    } else {
      card.votes.splice(voteIndex, 1);
    }

    broadcastRoom(currentRoom);
  });

  socket.on('toggle-reaction', ({ cardId, emoji }) => {
    if (!currentRoom || !REACTIONS.includes(emoji)) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const card = room.cards.find((c) => c.id === cardId);
    if (!card) return;

    if (!card.reactions[emoji]) card.reactions[emoji] = [];
    const reactors = card.reactions[emoji];

    const index = reactors.indexOf(participantId);
    if (index === -1) {
      reactors.push(participantId);
    } else {
      reactors.splice(index, 1);
      if (reactors.length === 0) delete card.reactions[emoji];
    }

    broadcastRoom(currentRoom);
  });

  socket.on('spotlight-card', ({ cardId }) => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    if (cardId !== null && !room.cards.some((c) => c.id === cardId)) return;

    room.spotlightCardId = cardId;
    broadcastRoom(currentRoom);
  });

  socket.on('start-timer', ({ seconds }) => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    const duration = Math.floor(Number(seconds));
    if (!Number.isFinite(duration) || duration < 1 || duration > MAX_TIMER_SECONDS) return;

    stopRoomTimer(room);

    room.timer = {
      durationSeconds: duration,
      endsAt: Date.now() + duration * 1000,
      finished: false,
      startedBy: room.participants.get(participantId)?.name || 'Someone',
    };

    // Server owns expiry so every client is nudged at the same moment.
    room.timerHandle = setTimeout(() => {
      const r = rooms.get(currentRoom);
      if (!r || !r.timer) return;
      r.timer = { ...r.timer, finished: true };
      r.timerHandle = null;
      io.to(currentRoom).emit('timer-up', { durationSeconds: r.timer.durationSeconds });
      broadcastRoom(currentRoom);
    }, duration * 1000);

    broadcastRoom(currentRoom);
  });

  socket.on('stop-timer', () => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    stopRoomTimer(room);
    room.timer = null;
    broadcastRoom(currentRoom);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

    room.participants.delete(participantId);
    broadcastRoom(currentRoom);

    if (room.participants.size === 0) {
      setTimeout(() => {
        const r = rooms.get(currentRoom);
        if (r && r.participants.size === 0) {
          stopRoomTimer(r);
          rooms.delete(currentRoom);
        }
      }, 60 * 60 * 1000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Sprint Retrospective running at http://localhost:${PORT}`);
  console.log('Room size: unlimited');
});
