const socket = io();

let currentRoomCode = '';
let myBoard = [];
let isHost = false;
let myPlayerId = '';
let currentTurnPlayerId = '';
let pendingAction = null;
let unreadChatMessages = 0;
let chatNotificationTimer = null;
let gameIsComplete = false;

const landingScreen = document.getElementById('landingScreen');
const gameScreen = document.getElementById('gameScreen');
const nameModal = document.getElementById('nameModal');
const playerNameInput = document.getElementById('playerNameInput');
const confirmNameBtn = document.getElementById('confirmNameBtn');
const cancelNameBtn = document.getElementById('cancelNameBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomCodeInput = document.getElementById('roomCodeInput');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const gameRoomCode = document.getElementById('gameRoomCode');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const bingoBoard = document.getElementById('bingoBoard');
const startGameBtn = document.getElementById('startGameBtn');
const readyGameBtn = document.getElementById('readyGameBtn');
const randomizeBtn = document.getElementById('randomizeBtn');
const turnInfo = document.getElementById('turnInfo');
const playerCount = document.getElementById('playerCount');
const playersList = document.getElementById('playersList');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const winnerModal = document.getElementById('winnerModal');
const winnerText = document.getElementById('winnerText');
const closeWinnerBtn = document.getElementById('closeWinnerBtn');
const replayGameBtn = document.getElementById('replayGameBtn');
const chatNotification = document.getElementById('chatNotification');
const chatNotificationCount = document.getElementById('chatNotificationCount');
const roomStatusMessage = document.getElementById('roomStatusMessage');
const viewerCount = document.getElementById('viewerCount');

// Event Listeners
createRoomBtn.addEventListener('click', () => showNameModal('create'));
joinRoomBtn.addEventListener('click', () => {
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) {
        alert('Please enter a room code');
        return;
    }
    showNameModal('join');
});
confirmNameBtn.addEventListener('click', confirmName);
cancelNameBtn.addEventListener('click', () => {
    nameModal.classList.add('hidden');
    pendingAction = null;
});
playerNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') confirmName();
});
leaveRoomBtn.addEventListener('click', leaveRoom);
copyCodeBtn.addEventListener('click', copyRoomCode);
startGameBtn.addEventListener('click', startGame);
readyGameBtn.addEventListener('click', () => {
    const willBeReady = !readyGameBtn.classList.contains('is-ready');
    socket.emit('setReady', { roomCode: currentRoomCode, isReady: willBeReady });
});
randomizeBtn.addEventListener('click', randomizeBoard);
replayGameBtn.addEventListener('click', () => socket.emit('replayGame', currentRoomCode));
chatNotification.addEventListener('click', () => {
    document.querySelector('.chat-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    hideChatNotification();
});
// Keep focus in the text field when Send is tapped. On mobile, moving focus to
// the button dismisses the software keyboard.
sendMessageBtn.addEventListener('pointerdown', (event) => event.preventDefault());
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});
chatInput.addEventListener('focus', () => {
    hideChatNotification();
    keepChatComposerVisible();
});

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', keepChatComposerVisible);
    window.visualViewport.addEventListener('scroll', keepChatComposerVisible);
}
closeWinnerBtn.addEventListener('click', () => {
    winnerModal.classList.add('hidden');
});

// Functions
function showScreen(screen) {
    landingScreen.classList.remove('active');
    gameScreen.classList.remove('active');
    screen.classList.add('active');
}

function showNameModal(action) {
    pendingAction = action;
    nameModal.classList.remove('hidden');
    playerNameInput.value = '';
    playerNameInput.focus();
}

function confirmName() {
    const name = playerNameInput.value.trim();
    if (!name) {
        alert('Please enter your name');
        return;
    }
    nameModal.classList.add('hidden');
    if (pendingAction === 'create') {
        socket.emit('createRoom', name);
    } else if (pendingAction === 'join') {
        const code = roomCodeInput.value.trim().toUpperCase();
        socket.emit('joinRoom', { roomCode: code, playerName: name });
    }
    pendingAction = null;
}

socket.on('viewerCount', (count) => {
    viewerCount.textContent = count;
});

function leaveRoom() {
    if (confirm('Are you sure you want to leave the room?')) {
        location.reload();
    }
}

function copyRoomCode() {
    navigator.clipboard.writeText(currentRoomCode);
    copyCodeBtn.textContent = '✓';
    setTimeout(() => {
        copyCodeBtn.textContent = '📋';
    }, 2000);
}

function startGame() {
    socket.emit('startGame', currentRoomCode);
}

function returnToLanding(message) {
    currentRoomCode = '';
    currentTurnPlayerId = '';
    gameIsComplete = false;
    isHost = false;
    winnerModal.classList.add('hidden');
    hideChatNotification();
    roomStatusMessage.textContent = message;
    roomStatusMessage.classList.remove('hidden');
    showScreen(landingScreen);
}

function randomizeBoard() {
    socket.emit('randomizeBoard', currentRoomCode);
}

function createBingoBoard(board) {
    bingoBoard.innerHTML = '';
    board.forEach((number, index) => {
        const cell = document.createElement('div');
        cell.className = 'bingo-cell';
        cell.textContent = number;
        cell.dataset.index = index;
        cell.addEventListener('click', () => selectNumber(index));
        bingoBoard.appendChild(cell);
    });
}

function selectNumber(index) {
    if (currentTurnPlayerId !== socket.id) return;
    const cell = bingoBoard.children[index];
    if (cell.classList.contains('marked')) return;
    socket.emit('selectNumber', { roomCode: currentRoomCode, numberIndex: index });
}

function updateTurnDisplay(playerName, isMyTurn) {
    turnInfo.classList.remove('hidden');
    if (isMyTurn) {
        turnInfo.textContent = "Your turn! Click a number on your board";
        turnInfo.classList.add('my-turn');
    } else {
        turnInfo.textContent = `${playerName}'s turn`;
        turnInfo.classList.remove('my-turn');
    }
}

function renderPlayers(players, count, hostId) {
    playerCount.textContent = count;
    playersList.innerHTML = '';
    isHost = hostId === socket.id;

    players.forEach(player => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        const badges = [];
        if (player.id === hostId || player.isHost) badges.push('<span class="badge host-badge">HOST</span>');
        if (player.isReady) badges.push('<span class="badge ready-badge">READY</span>');
        if (player.id === socket.id) badges.push('<span class="badge you-badge">YOU</span>');
        playerDiv.innerHTML = `<span>${player.name}</span><div class="player-badges">${badges.join('')}</div>`;
        playersList.appendChild(playerDiv);
    });

    const me = players.find(player => player.id === socket.id);
    const iAmReady = Boolean(me?.isReady);
    readyGameBtn.classList.toggle('is-ready', iAmReady);
    readyGameBtn.textContent = iAmReady ? 'Ready ✓' : "I'm Ready";
    const isLobby = !gameIsComplete && !currentTurnPlayerId;
    readyGameBtn.classList.toggle('hidden', isHost || !isLobby);

    if (isHost && !startGameBtn.classList.contains('hidden')) {
        const everyoneReady = count >= 2 && players.every(player => player.isReady);
        startGameBtn.disabled = !everyoneReady;
        startGameBtn.textContent = everyoneReady ? 'Start Game' : 'Waiting for everyone to get ready...';
    }
}

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    socket.emit('chatMessage', { roomCode: currentRoomCode, message: message });
    chatInput.value = '';
    // Refocus after the click handler finishes so the keyboard stays open for
    // the next message.
    requestAnimationFrame(() => {
        chatInput.focus({ preventScroll: true });
        keepChatComposerVisible();
    });
}

function isChatOpen() {
    if (document.activeElement === chatInput) return true;

    const chatCard = document.querySelector('.chat-card');
    if (!chatCard) return false;

    const rect = chatCard.getBoundingClientRect();
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    // A visible chat panel means the user is already reading the conversation.
    return rect.bottom > 0 && rect.top < viewportHeight;
}

function keepChatComposerVisible() {
    if (!window.matchMedia('(max-width: 768px)').matches || document.activeElement !== chatInput) return;

    requestAnimationFrame(() => {
        const viewportHeight = window.visualViewport?.height || window.innerHeight;
        const inputRect = chatInput.getBoundingClientRect();
        if (inputRect.bottom > viewportHeight - 12 || inputRect.top < 0) {
            chatInput.scrollIntoView({ block: 'end', inline: 'nearest' });
        }
    });
}

function addChatMessage(playerName, message, isSystem = false, notify = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    if (isSystem) {
        msgDiv.innerHTML = `<em style="color: var(--text-secondary)">${message}</em>`;
    } else {
        msgDiv.innerHTML = `<strong>${playerName}:</strong> ${message}`;
    }
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (notify && window.matchMedia('(max-width: 768px)').matches && !isChatOpen()) showChatNotification();
}

function showChatNotification() {
    unreadChatMessages++;
    chatNotificationCount.textContent = unreadChatMessages > 9 ? '9+' : unreadChatMessages;
    chatNotification.classList.remove('hidden');
    clearTimeout(chatNotificationTimer);
    chatNotificationTimer = setTimeout(hideChatNotification, 3000);
}

function hideChatNotification() {
    unreadChatMessages = 0;
    chatNotification.classList.add('hidden');
    clearTimeout(chatNotificationTimer);
    chatNotificationTimer = null;
}

// Socket Events
socket.on('roomCreated', ({ roomCode, board, isHost: host }) => {
    currentRoomCode = roomCode;
    myBoard = board;
    isHost = host;
    myPlayerId = socket.id;
    gameRoomCode.textContent = roomCode;
    createBingoBoard(board);
    if (isHost) {
        startGameBtn.classList.remove('hidden');
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Waiting for everyone to get ready...';
    }
    readyGameBtn.classList.toggle('hidden', isHost);
    showScreen(gameScreen);
    addChatMessage('', 'Welcome to the room!', true);
});

socket.on('roomJoined', ({ roomCode, board, isHost: host }) => {
    currentRoomCode = roomCode;
    myBoard = board;
    isHost = host;
    myPlayerId = socket.id;
    gameRoomCode.textContent = roomCode;
    createBingoBoard(board);
    readyGameBtn.classList.toggle('hidden', isHost);
    showScreen(gameScreen);
    addChatMessage('', 'You joined the room!', true);
});

socket.on('updatePlayers', ({ players, playerCount: count, hostId }) => {
    renderPlayers(players, count, hostId);
});

socket.on('gameStarted', ({ currentPlayer, currentPlayerId }) => {
    gameIsComplete = false;
    currentTurnPlayerId = currentPlayerId;
    const isMyTurn = currentPlayerId === socket.id;
    startGameBtn.classList.add('hidden');
    readyGameBtn.classList.add('hidden');
    randomizeBtn.classList.add('hidden');
    replayGameBtn.classList.add('hidden');
    Array.from(bingoBoard.children).forEach(cell => {
        cell.style.pointerEvents = '';
    });
    updateTurnDisplay(currentPlayer, isMyTurn);
    addChatMessage('', 'Game started!', true);
});

socket.on('numberCalled', ({ number, calledBy, allPlayerBoards }) => {
    if (allPlayerBoards) {
        const myPlayerBoard = allPlayerBoards.find(p => p.id === socket.id);
        if (myPlayerBoard) {
            const cells = bingoBoard.children;
            myPlayerBoard.markedIndices.forEach(index => {
                cells[index].classList.add('marked');
            });
        }
    }
    addChatMessage('', `${calledBy} called number ${number}`, true);
});

socket.on('turnChanged', ({ currentPlayer, currentPlayerId }) => {
    currentTurnPlayerId = currentPlayerId;
    const isMyTurn = currentPlayerId === socket.id;
    updateTurnDisplay(currentPlayer, isMyTurn);
});

socket.on('gameWon', ({ winner, winnerId, winners = [] }) => {
    gameIsComplete = true;
    const isTie = winners.length > 1;
    const isWinner = winnerId === socket.id;
    const winnerNames = winners.map(player => player.name).join(' and ');

    if (isTie) {
        winnerText.textContent = `🏆 Tie: ${winnerNames} won! 🏆`;
    } else {
        winnerText.textContent = isWinner ? '🎉 You Won! 🎉' : `🏆 ${winner} Won! 🏆`;
    }
    winnerModal.classList.remove('hidden');
    currentTurnPlayerId = '';
    Array.from(bingoBoard.children).forEach(cell => {
        cell.style.pointerEvents = 'none';
    });
    addChatMessage('', isTie ? `${winnerNames} won the game!` : `${winner} won the game!`, true);
    turnInfo.classList.add('hidden');
    if (isHost) replayGameBtn.classList.remove('hidden');
});

socket.on('boardRandomized', ({ board }) => {
    myBoard = board;
    createBingoBoard(board);
});

socket.on('gameReset', ({ message }) => {
    gameIsComplete = false;
    currentTurnPlayerId = '';
    winnerModal.classList.add('hidden');
    turnInfo.classList.add('hidden');
    randomizeBtn.classList.remove('hidden');
    readyGameBtn.classList.toggle('hidden', isHost);
    replayGameBtn.classList.add('hidden');
    if (isHost) {
        startGameBtn.classList.remove('hidden');
        startGameBtn.disabled = true;
        startGameBtn.textContent = 'Waiting for everyone to get ready...';
    }
    addChatMessage('', message, true);
});

socket.on('chatMessage', ({ playerName, playerId, message }) => {
    addChatMessage(playerName, message, false, playerId !== socket.id);
});

socket.on('playerLeft', ({ playerName }) => {
    addChatMessage('', `${playerName} left the room`, true);
});

socket.on('roomClosed', ({ message }) => {
    returnToLanding(message);
});

socket.on('error', (message) => {
    alert(message);
});
