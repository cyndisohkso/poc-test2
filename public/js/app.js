const socket = io();

let participantId = null;
let roomCode = null;
let roomState = { cards: [], participants: [], reactions: [] };
let openPickerCardId = null;
let timerInterval = null;

const landing = document.getElementById('landing');
const board = document.getElementById('board');
const landingError = document.getElementById('landing-error');

const COLUMNS = ['went-well', 'improve', 'action-items'];
const COLUMN_LABELS = {
  'went-well': '🎉 What Went Well',
  improve: '🔧 What To Improve',
  'action-items': '✅ Action Items',
};
const AVATARS_SHOWN = 5;

// Cards already rendered once should not replay the entry animation on every update.
const seenCards = new Set();

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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function avatar(name, color, initials, extraClass = '') {
  return `<span class="avatar ${extraClass}" style="background:${color}" title="${escapeHtml(name)}">${escapeHtml(initials || '?')}</span>`;
}

function inviteLink(code) {
  return `${window.location.origin}/r/${code}`;
}

// navigator.clipboard is unavailable over plain http (e.g. sharing via LAN IP).
function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    try {
      document.execCommand('copy') ? resolve() : reject();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(el);
    }
  });
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function updateTimer() {
  if (!roomState.createdAt) return;
  document.getElementById('session-timer').textContent = formatDuration(Date.now() - roomState.createdAt);
}

function startTimer() {
  const tick = () => {
    updateTimer();
    updateCountdown();
  };
  tick();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(tick, 1000);
}

function renderBoard() {
  document.getElementById('room-code-display').textContent = roomCode;
  document.getElementById('participant-count').textContent = roomState.participants.length;
  updateTimer();

  const stack = document.getElementById('avatar-stack');
  const shown = roomState.participants.slice(0, AVATARS_SHOWN);
  const overflow = roomState.participants.length - shown.length;
  stack.innerHTML =
    shown.map((p) => avatar(p.name, p.color, p.initials)).join('') +
    (overflow > 0 ? `<span class="avatar avatar-more" title="${overflow} more">+${overflow}</span>` : '');

  const participantsList = document.getElementById('participants-list');
  participantsList.innerHTML = roomState.participants
    .map(
      (p) => `
      <div class="participant-item">
        ${avatar(p.name, p.color, p.initials, 'avatar-sm')}
        <span>${escapeHtml(p.name)}${p.id === participantId ? ' (you)' : ''}</span>
      </div>`
    )
    .join('');

  for (const column of COLUMNS) {
    const cards = orderedColumnCards(column);

    document.getElementById(`count-${column}`).textContent = cards.length;

    const container = document.getElementById(`cards-${column}`);
    const scrollTop = container.scrollTop;
    container.innerHTML = cards.map((card) => renderCard(card)).join('');
    container.scrollTop = scrollTop;

    cards.forEach((c) => seenCards.add(c.id));
  }

  restoreOpenPicker();
  hideReactionTooltip();
  renderSpotlight();
  updateCountdown();
}

function orderedColumnCards(column) {
  return roomState.cards
    .filter((c) => c.column === column)
    .sort((a, b) => b.votes.length - a.votes.length || a.createdAt - b.createdAt);
}

function renderReactions(card) {
  const entries = Object.entries(card.reactions || {}).filter(([, ids]) => ids.length > 0);

  const chips = entries
    .map(([emoji, ids]) => {
      const mine = ids.includes(participantId) ? 'reacted' : '';
      return `<button class="reaction-chip ${mine}" data-card-id="${card.id}" data-emoji="${emoji}">
        <span>${emoji}</span> ${ids.length}
      </button>`;
    })
    .join('');

  const picker = (roomState.reactions || [])
    .map(
      (emoji) =>
        `<button class="picker-emoji" data-card-id="${card.id}" data-emoji="${emoji}" title="React ${emoji}">${emoji}</button>`
    )
    .join('');

  return `
    <div class="retro-card-reactions">
      ${chips}
      <div class="reaction-add-wrap">
        <button class="reaction-add" data-card-id="${card.id}" title="Add a reaction">☺+</button>
        <div class="reaction-picker hidden" data-picker-for="${card.id}">${picker}</div>
      </div>
    </div>`;
}

function renderCard(card) {
  const isOwn = card.authorId === participantId;
  const hasVoted = card.votes.includes(participantId);
  const isNew = !seenCards.has(card.id) ? 'card-new' : '';

  return `
    <div class="retro-card ${isNew}">
      <p class="retro-card-text">${escapeHtml(card.text)}</p>
      ${renderReactions(card)}
      <div class="retro-card-footer">
        <span class="retro-card-author">
          ${avatar(card.authorName, card.authorColor, card.authorInitials, 'avatar-sm')}
          ${escapeHtml(card.authorName)}
        </span>
        <div class="retro-card-actions">
          <button class="spotlight-btn" data-card-id="${card.id}" title="Spotlight this note for everyone">◎</button>
          <button class="vote-btn ${hasVoted ? 'voted' : ''}" data-card-id="${card.id}">
            ▲ ${card.votes.length}
          </button>
          ${isOwn ? `<button class="delete-btn" data-card-id="${card.id}" title="Delete">✕</button>` : ''}
        </div>
      </div>
    </div>`;
}

// People stay resolvable after they leave, so old reactions still show a name.
function personById(id) {
  return (
    (roomState.people || []).find((p) => p.id === id) ||
    roomState.participants.find((p) => p.id === id)
  );
}

function showReactionTooltip(chip) {
  const card = roomState.cards.find((c) => c.id === chip.dataset.cardId);
  if (!card) return;

  const ids = (card.reactions || {})[chip.dataset.emoji] || [];
  if (ids.length === 0) return;

  const rows = ids
    .map((id) => {
      const person = personById(id);
      const name = person ? person.name : 'Someone who left';
      const color = person ? person.color : '#4b5563';
      const initials = person ? person.initials : '?';
      const you = id === participantId ? ' (you)' : '';
      return `<div class="tooltip-person">
        ${avatar(name, color, initials, 'avatar-sm')}
        <span>${escapeHtml(name)}${you}</span>
      </div>`;
    })
    .join('');

  const tip = document.getElementById('reaction-tooltip');
  tip.innerHTML = `<div class="tooltip-title"><span>${chip.dataset.emoji}</span> reacted by</div>${rows}`;
  tip.classList.remove('hidden');

  const chipBox = chip.getBoundingClientRect();
  const tipBox = tip.getBoundingClientRect();

  const left = Math.max(
    8,
    Math.min(
      chipBox.left + chipBox.width / 2 - tipBox.width / 2,
      window.innerWidth - tipBox.width - 8
    )
  );
  const above = chipBox.top - tipBox.height - 8;

  tip.style.left = `${left}px`;
  tip.style.top = `${above < 8 ? chipBox.bottom + 8 : above}px`;
}

function hideReactionTooltip() {
  document.getElementById('reaction-tooltip').classList.add('hidden');
}

function closePickers() {
  openPickerCardId = null;
  document.querySelectorAll('.reaction-picker').forEach((p) => p.classList.add('hidden'));
}

function restoreOpenPicker() {
  if (!openPickerCardId) return;
  const picker = document.querySelector(`.reaction-picker[data-picker-for="${openPickerCardId}"]`);
  if (picker) {
    picker.classList.remove('hidden');
  } else {
    openPickerCardId = null;
  }
}

// Cards are re-rendered on every update, so card actions use delegation.
document.querySelector('.board-columns').addEventListener('click', (e) => {
  const voteBtn = e.target.closest('.vote-btn');
  if (voteBtn) {
    socket.emit('toggle-vote', { cardId: voteBtn.dataset.cardId });
    return;
  }

  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    socket.emit('delete-card', { cardId: deleteBtn.dataset.cardId });
    return;
  }

  const spotlightBtn = e.target.closest('.spotlight-btn');
  if (spotlightBtn) {
    socket.emit('spotlight-card', { cardId: spotlightBtn.dataset.cardId });
    return;
  }

  const chip = e.target.closest('.reaction-chip');
  if (chip) {
    socket.emit('toggle-reaction', { cardId: chip.dataset.cardId, emoji: chip.dataset.emoji });
    return;
  }

  const pickerEmoji = e.target.closest('.picker-emoji');
  if (pickerEmoji) {
    socket.emit('toggle-reaction', {
      cardId: pickerEmoji.dataset.cardId,
      emoji: pickerEmoji.dataset.emoji,
    });
    closePickers();
    return;
  }

  const addBtn = e.target.closest('.reaction-add');
  if (addBtn) {
    const cardId = addBtn.dataset.cardId;
    const wasOpen = openPickerCardId === cardId;
    closePickers();
    if (!wasOpen) {
      openPickerCardId = cardId;
      restoreOpenPicker();
    }
    return;
  }

  closePickers();
});

const columnsEl = document.querySelector('.board-columns');

columnsEl.addEventListener('mouseover', (e) => {
  const chip = e.target.closest('.reaction-chip');
  if (chip) showReactionTooltip(chip);
});

columnsEl.addEventListener('mouseout', (e) => {
  if (e.target.closest('.reaction-chip')) hideReactionTooltip();
});

// The tooltip is fixed-position, so it has to follow or hide when content moves.
columnsEl.addEventListener('scroll', hideReactionTooltip, true);
window.addEventListener('resize', hideReactionTooltip);

document.addEventListener('click', (e) => {
  if (!e.target.closest('.retro-card-reactions')) closePickers();
  if (!e.target.closest('.countdown-wrap')) closeTimerPopover();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  closePickers();
  closeTimerPopover();

  const timeup = document.getElementById('timeup-overlay');
  if (!timeup.classList.contains('hidden')) {
    timeup.classList.add('hidden');
    return;
  }

  if (roomState.spotlightCardId) closeSpotlight();
});

/* ── Spotlight ── */

function renderSpotlight() {
  const overlay = document.getElementById('spotlight-overlay');
  const card = roomState.spotlightCardId
    ? roomState.cards.find((c) => c.id === roomState.spotlightCardId)
    : null;

  if (!card) {
    overlay.classList.add('hidden');
    return;
  }

  document.getElementById('spotlight-column').textContent = COLUMN_LABELS[card.column] || '';

  const isOwner = card.authorId === participantId;
  overlay.classList.toggle('is-owner', isOwner);
  document.getElementById('spotlight-owner').innerHTML = `
    ${avatar(card.authorName, card.authorColor, card.authorInitials)}
    <div class="owner-lines">
      <strong>${escapeHtml(card.authorName)}</strong>
      <span>${isOwner ? 'Your note is in the spotlight — walk the team through it' : 'is walking the team through this note'}</span>
    </div>`;

  document.getElementById('spotlight-text').textContent = card.text;

  const reactionSummary = Object.entries(card.reactions || {})
    .filter(([, ids]) => ids.length > 0)
    .map(([emoji, ids]) => `<span class="spotlight-reaction">${emoji} ${ids.length}</span>`)
    .join('');

  document.getElementById('spotlight-meta').innerHTML =
    `<span class="spotlight-votes">▲ ${card.votes.length} ${card.votes.length === 1 ? 'vote' : 'votes'}</span>${reactionSummary}`;

  const siblings = orderedColumnCards(card.column);
  const index = siblings.findIndex((c) => c.id === card.id);
  document.getElementById('btn-spotlight-prev').disabled = index <= 0;
  document.getElementById('btn-spotlight-next').disabled = index === -1 || index >= siblings.length - 1;

  overlay.classList.remove('hidden');
}

function moveSpotlight(offset) {
  const card = roomState.cards.find((c) => c.id === roomState.spotlightCardId);
  if (!card) return;

  const siblings = orderedColumnCards(card.column);
  const next = siblings[siblings.findIndex((c) => c.id === card.id) + offset];
  if (next) socket.emit('spotlight-card', { cardId: next.id });
}

function closeSpotlight() {
  socket.emit('spotlight-card', { cardId: null });
}

document.getElementById('btn-close-spotlight').addEventListener('click', closeSpotlight);
document.getElementById('btn-spotlight-prev').addEventListener('click', () => moveSpotlight(-1));
document.getElementById('btn-spotlight-next').addEventListener('click', () => moveSpotlight(1));

document.getElementById('spotlight-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'spotlight-overlay') closeSpotlight();
});

/* ── Countdown timer ── */

function updateCountdown() {
  const badge = document.getElementById('countdown-badge');
  const openBtn = document.getElementById('btn-timer');
  const timer = roomState.timer;

  if (!timer) {
    badge.classList.add('hidden');
    badge.classList.remove('finished');
    openBtn.classList.remove('hidden');
    return;
  }

  const remaining = Math.max(0, timer.endsAt - Date.now());
  document.getElementById('countdown-value').textContent = formatDuration(remaining);
  badge.classList.toggle('finished', timer.finished || remaining === 0);
  badge.classList.remove('hidden');
  openBtn.classList.add('hidden');
}

function closeTimerPopover() {
  document.getElementById('timer-popover').classList.add('hidden');
}

function beginTimer(seconds) {
  socket.emit('start-timer', { seconds });
  closeTimerPopover();
}

document.getElementById('btn-timer').addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('timer-popover').classList.toggle('hidden');
});

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => beginTimer(Number(btn.dataset.minutes) * 60));
});

document.getElementById('custom-timer-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('custom-minutes');
  const minutes = Number(input.value);

  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 240) {
    showToast('Enter a duration between 1 and 240 minutes');
    return;
  }

  beginTimer(Math.floor(minutes) * 60);
  input.value = '';
});

document.getElementById('btn-stop-timer').addEventListener('click', () => {
  socket.emit('stop-timer');
});

document.getElementById('btn-dismiss-timeup').addEventListener('click', () => {
  document.getElementById('timeup-overlay').classList.add('hidden');
});

socket.on('timer-up', ({ durationSeconds }) => {
  const minutes = Math.round(durationSeconds / 60);
  document.getElementById('timeup-detail').textContent =
    `The ${minutes} minute timer has finished.`;
  document.getElementById('timeup-overlay').classList.remove('hidden');
});

function openShareDialog() {
  document.getElementById('share-link').value = inviteLink(roomCode);
  document.getElementById('share-code').textContent = roomCode;
  document.getElementById('share-overlay').classList.remove('hidden');
}

function closeShareDialog() {
  document.getElementById('share-overlay').classList.add('hidden');
}

function joinRoom(code, name, { created = false } = {}) {
  clearError();
  socket.emit('join-room', { code, name }, (response) => {
    if (!response.success) {
      showError(response.error);
      return;
    }

    participantId = response.participantId;
    roomCode = response.room.code;
    roomState = response.room;
    localStorage.setItem('retro-name', name);

    // Keep the address bar itself shareable.
    window.history.replaceState({}, '', `/r/${roomCode}`);

    showScreen('board');
    renderBoard();
    startTimer();

    showToast(
      created
        ? `Room ${roomCode} created — use “Share link” to invite your team`
        : `Joined room ${roomCode}`
    );
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

  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  socket.emit('create-room', (response) => {
    btn.disabled = false;
    if (response.success) {
      document.getElementById('join-code').value = response.code;
      joinRoom(response.code, name, { created: true });
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
  copyText(roomCode)
    .then(() => showToast('Room code copied'))
    .catch(() => showToast('Could not copy — select it manually'));
});

document.getElementById('btn-share').addEventListener('click', openShareDialog);
document.getElementById('btn-close-share').addEventListener('click', closeShareDialog);

document.getElementById('share-overlay').addEventListener('click', (e) => {
  if (e.target.id === 'share-overlay') closeShareDialog();
});

document.getElementById('btn-copy-share-code').addEventListener('click', () => {
  copyText(roomCode)
    .then(() => showToast('Room code copied'))
    .catch(() => showToast('Could not copy — select it manually'));
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
  copyText(inviteLink(roomCode))
    .then(() => showToast('Invite link copied'))
    .catch(() => showToast('Could not copy — select the link manually'));
  document.getElementById('share-link').select();
});

document.querySelectorAll('.add-card-form').forEach((form) => {
  const textarea = form.querySelector('textarea');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = textarea.value.trim();
    if (!text) return;

    socket.emit('add-card', { column: form.dataset.column, text });
    textarea.value = '';
    textarea.focus();
  });

  // Enter posts the note; Shift+Enter inserts a line break.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit();
    }
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

function codeFromUrl() {
  const fromPath = window.location.pathname.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  if (fromPath) return fromPath[1].toUpperCase();
  const fromQuery = new URLSearchParams(window.location.search).get('room');
  return fromQuery ? fromQuery.toUpperCase() : null;
}

function init() {
  const savedName = localStorage.getItem('retro-name');
  if (savedName) document.getElementById('join-name').value = savedName;

  const invited = codeFromUrl();
  if (!invited) return;

  document.getElementById('join-code').value = invited;
  document.getElementById('invite-code').textContent = invited;
  document.getElementById('invite-banner').classList.remove('hidden');
  document.getElementById('create-card').classList.add('hidden');
  document.getElementById('landing-divider').classList.add('hidden');

  const nameInput = document.getElementById('join-name');
  nameInput.focus();
  nameInput.select();
}

init();
