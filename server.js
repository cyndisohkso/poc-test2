const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const MAX_PARTICIPANTS = 15;
const PORT = process.env.PORT || 3000;

const rooms = new Map();

const COLUMNS = ['went-well', 'improve', 'action-items'];

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function createRoom(code) {
  return {
    code,
    cards: [],
    participants: new Map(),
    createdAt: Date.now(),
  };
}

function getRoomState(room) {
  return {
    code: room.code,
    cards: room.cards,
    participants: Array.from(room.participants.values()),
  };
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

    if (room.participants.size >= MAX_PARTICIPANTS) {
      callback({
        success: false,
        error: `This room is full (${MAX_PARTICIPANTS}/${MAX_PARTICIPANTS} participants).`,
      });
      return;
    }

    const trimmedName = name.trim().slice(0, 30);
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

    const colors = [
      '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
      '#8b5cf6', '#06b6d4', '#ef4444', '#22c55e',
      '#a855f7', '#3b82f6', '#f97316', '#10b981',
      '#e11d48', '#0ea5e9', '#84cc16',
    ];
    const colorIndex = room.participants.size % colors.length;

    room.participants.set(participantId, {
      id: participantId,
      name: trimmedName,
      color: colors[colorIndex],
      joinedAt: Date.now(),
    });

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
      votes: [],
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
          rooms.delete(currentRoom);
        }
      }, 60 * 60 * 1000);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Sprint Retro running at http://localhost:${PORT}`);
  console.log(`Max participants per room: ${MAX_PARTICIPANTS}`);
});
