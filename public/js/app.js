const socket = io();

let participantId = null;
let roomCode = null;
let roomState = { cards: [], participants: [] };

const landing = document.getElementById('landing');
const board = document.getElementById('board');
const landingError = document.getElementById('landing-error');

const COLUMNS = ['went-well', 'improve', 'action-items'];

function showError(msg) {
  landingError.textContent = msg;
  landingError.classList.remove('hidden');
}

function clearError() {
  landingError.classList.add('hidden');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2500);
}

function showScreen(screen) {
  landing.classList.toggle('active', screen === 'landing');
  board.classList.toggle('active', screen === 'board');
}

function renderBoard() {
  document.getElementById('room-code-display').textContent = roomCode;
  document.getElementById('participant-count').textContent = roomState.participants.length;

  const participantsList = document.getElementById('participants-list');
  participantsList.innerHTML = roomState.participants
    .map(
      (p) => `
      <div class="participant-item">
        <span class="participant-dot" style="background:${p.color}"></span>
        ${escapeHtml(p.name)}${p.id === participantId ? ' (you)' : ''}
      </div>`
    )
    .join('');

  for (const column of COLUMNS) {
    const cards = roomState.cards
      .filter((c) => c.column === column)
      .sort((a, b) => b.votes.length - a.votes.length || a.createdAt - b.createdAt);

    document.getElementById(`count-${column}`).textContent = cards.length;

    const container = document.getElementById(`cards-${column}`);
    container.innerHTML = cards.map((card) => renderCard(card)).join('');

    container.querySelectorAll('.vote-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('toggle-vote', { cardId: btn.dataset.cardId });
      });
    });

    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        socket.emit('delete-card', { cardId: btn.dataset.cardId });
      });
    });
  }
}

function renderCard(card) {
  const isOwn = card.authorId === participantId;
  const hasVoted = card.votes.includes(participantId);

  return `
    <div class="retro-card">
      <p class="retro-card-text">${escapeHtml(card.text)}</p>
      <div class="retro-card-footer">
        <span class="retro-card-author">
          <span class="author-dot" style="background:${card.authorColor}"></span>
          ${escapeHtml(card.authorName)}
        </span>
        <div class="retro-card-actions">
          <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-card-id="${card.id}">
            ▲ ${card.votes.length}
          </button>
          ${isOwn ? `<button class="delete-btn" data-card-id="${card.id}" title="Delete">✕</button>` : ''}
        </div>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function joinRoom(code, name) {
  clearError();
  socket.emit('join-room', { code, name }, (response) => {
    if (!response.success) {
      showError(response.error);
      return;
    }

    participantId = response.participantId;
    roomCode = response.room.code;
    roomState = response.room;
    showScreen('board');
    renderBoard();
    showToast(`Joined room ${roomCode}`);
  });
}

document.getElementById('btn-create').addEventListener('click', () => {
  clearError();
  const name = document.getElementById('join-name').value.trim();
  if (!name) {
    showError('Please enter your name before creating a room.');
    document.getElementById('join-name').focus();
    return;
  }

  document.getElementById('btn-create').disabled = true;
  socket.emit('create-room', (response) => {
    document.getElementById('btn-create').disabled = false;
    if (response.success) {
      document.getElementById('join-code').value = response.code;
      joinRoom(response.code, name);
    }
  });
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim();
  const name = document.getElementById('join-name').value.trim();

  if (!code) {
    showError('Please enter a room code.');
    return;
  }
  if (!name) {
    showError('Please enter your name.');
    return;
  }

  joinRoom(code, name);
});

document.getElementById('join-code').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

document.getElementById('join-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

document.getElementById('join-code').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join').click();
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
  navigator.clipboard.writeText(roomCode).then(() => {
    showToast('Room code copied!');
  });
});

document.querySelectorAll('.add-card-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const column = form.dataset.column;
    const textarea = form.querySelector('textarea');
    const text = textarea.value.trim();

    if (!text) return;

    socket.emit('add-card', { column, text });
    textarea.value = '';
    textarea.focus();
  });
});

socket.on('room-update', (state) => {
  roomState = state;
  if (board.classList.contains('active')) {
    renderBoard();
  }
});

socket.on('connect_error', () => {
  showError('Could not connect to server. Make sure it is running.');
});

socket.on('disconnect', () => {
  if (board.classList.contains('active')) {
    showToast('Connection lost — reconnecting...');
  }
});

socket.on('connect', () => {
  if (roomCode && participantId && board.classList.contains('active')) {
    const name = roomState.participants.find((p) => p.id === participantId)?.name;
    if (name) {
      socket.emit('join-room', { code: roomCode, name }, (response) => {
        if (response.success) {
          participantId = response.participantId;
          roomState = response.room;
          renderBoard();
        }
      });
    }
  }
});
