const socket = io();

let currentRoomCode = '';
let myBoard = [];
let isHost = false;
let myPlayerId = '';
let currentTurnPlayerId = '';
let pendingAction = null;

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
randomizeBtn.addEventListener('click', randomizeBoard);
sendMessageBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});
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

function randomizeBoard() {
    if (!myBoard || myBoard.length === 0) return;
    for (let i = myBoard.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [myBoard[i], myBoard[j]] = [myBoard[j], myBoard[i]];
    }
    createBingoBoard(myBoard);
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

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    socket.emit('chatMessage', { roomCode: currentRoomCode, message: message });
    chatInput.value = '';
}

function addChatMessage(playerName, message, isSystem = false) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message';
    if (isSystem) {
        msgDiv.innerHTML = `<em style="color: var(--text-secondary)">${message}</em>`;
    } else {
        msgDiv.innerHTML = `<strong>${playerName}:</strong> ${message}`;
    }
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
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
        startGameBtn.textContent = 'Waiting for players...';
    }
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
    showScreen(gameScreen);
    addChatMessage('', 'You joined the room!', true);
});

socket.on('updatePlayers', ({ players, playerCount: count }) => {
    playerCount.textContent = count;
    playersList.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        const badges = [];
        if (index === 0) badges.push('<span class="badge host-badge">HOST</span>');
        if (player.id === socket.id) badges.push('<span class="badge you-badge">YOU</span>');
        playerDiv.innerHTML = `
            <span>${player.name}</span>
            <div class="player-badges">${badges.join('')}</div>
        `;
        playersList.appendChild(playerDiv);
    });
    if (isHost) {
        if (count >= 2) {
            startGameBtn.disabled = false;
            startGameBtn.textContent = 'Start Game';
        } else {
            startGameBtn.disabled = true;
            startGameBtn.textContent = 'Waiting for players...';
        }
    }
});

socket.on('gameStarted', ({ currentPlayer, currentPlayerId }) => {
    currentTurnPlayerId = currentPlayerId;
    const isMyTurn = currentPlayerId === socket.id;
    startGameBtn.classList.add('hidden');
    randomizeBtn.classList.add('hidden');
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

socket.on('gameWon', ({ winner, winnerId }) => {
    const isWinner = winnerId === socket.id;
    winnerText.textContent = isWinner ? '🎉 You Won! 🎉' : `🏆 ${winner} Won! 🏆`;
    winnerModal.classList.remove('hidden');
    Array.from(bingoBoard.children).forEach(cell => {
        cell.style.pointerEvents = 'none';
    });
    addChatMessage('', `${winner} won the game!`, true);
});

socket.on('chatMessage', ({ playerName, message }) => {
    addChatMessage(playerName, message);
});

socket.on('playerLeft', ({ playerName, players, playerCount: count }) => {
    playerCount.textContent = count;
    playersList.innerHTML = '';
    players.forEach((player, index) => {
        const playerDiv = document.createElement('div');
        playerDiv.className = 'player-item';
        const badges = [];
        if (index === 0) badges.push('<span class="badge host-badge">HOST</span>');
        if (player.id === socket.id) badges.push('<span class="badge you-badge">YOU</span>');
        playerDiv.innerHTML = `
            <span>${player.name}</span>
            <div class="player-badges">${badges.join('')}</div>
        `;
        playersList.appendChild(playerDiv);
    });
    addChatMessage('', `${playerName} left the room`, true);
});

socket.on('becameHost', () => {
    isHost = true;
    startGameBtn.classList.remove('hidden');
    addChatMessage('', 'You are now the host!', true);
});

socket.on('error', (message) => {
    alert(message);
});
